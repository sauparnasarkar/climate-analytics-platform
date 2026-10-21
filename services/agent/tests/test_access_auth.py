"""Cloudflare Access JWT check on the admin endpoints (access_auth.py)."""

from __future__ import annotations

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from agent import access_auth, server, settings
from agent.graph import _default_checkpointer
from agent.server import LlmChoiceResponse

TEAM = "example.cloudflareaccess.com"
AUD = "aud-tag-123"


@pytest.fixture(scope="module")
def keypair():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def configured(monkeypatch, tmp_path, keypair):
    monkeypatch.setenv("CF_ACCESS_TEAM_DOMAIN", f"https://{TEAM}/")
    monkeypatch.setenv("CF_ACCESS_AUD", AUD)
    monkeypatch.setenv("AGENT_ADMIN_STORE_PATH", str(tmp_path / "llm_choice.json"))

    class FakeJwks:
        def get_signing_key_from_jwt(self, token):
            return type("K", (), {"key": keypair.public_key()})()

    monkeypatch.setattr(access_auth, "_jwk_client", lambda team: FakeJwks())
    initial = settings.choice_by_id("anthropic-sonnet")
    server.app.state.mcp_tools = []
    server.app.state.checkpointer = _default_checkpointer()
    server.app.state.llm_choice = LlmChoiceResponse(provider=initial.provider, model=initial.model, label=initial.label, updated_at=settings.now_iso())
    server.app.state.graph = None


def _token(keypair, **overrides):
    now = int(time.time())
    claims = {"aud": [AUD], "iss": f"https://{TEAM}", "iat": now, "exp": now + 300, "email": "the-owner"}
    claims.update(overrides)
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, keypair, algorithm="RS256")


def _get(token=None):
    headers = {"cf-access-jwt-assertion": token} if token else {}
    return TestClient(server.app).get("/admin/llm", headers=headers)


def test_a_valid_token_is_admitted(configured, keypair):
    assert _get(_token(keypair)).status_code == 200


def test_no_token_is_refused_when_configured(configured):
    response = _get()
    assert response.status_code == 403
    assert "Cloudflare Access" in response.json()["detail"]


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": ["some-other-application"]},
        {"iss": "https://evil.cloudflareaccess.com"},
        {"exp": int(time.time()) - 10},
        {"exp": None},
    ],
)
def test_a_token_for_another_application_issuer_or_expired_is_refused(configured, keypair, overrides):
    assert _get(_token(keypair, **overrides)).status_code == 403


def test_a_token_signed_with_another_key_is_refused(configured):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assert _get(_token(other)).status_code == 403


def test_an_hs256_token_cannot_pass_as_rs256(configured):
    now = int(time.time())
    forged = jwt.encode({"aud": [AUD], "iss": f"https://{TEAM}", "iat": now, "exp": now + 300}, "x" * 40, algorithm="HS256")
    assert _get(forged).status_code == 403


def test_post_is_gated_too(configured, keypair):
    client = TestClient(server.app)
    assert client.post("/admin/llm", json={"id": "nope"}).status_code == 403
    admitted = client.post("/admin/llm", json={"id": "nope"}, headers={"cf-access-jwt-assertion": _token(keypair)})
    assert admitted.status_code == 422  # past the check, refused for the unknown choice id


def test_unconfigured_refuses_admin_and_logs_once(monkeypatch, tmp_path, caplog):
    monkeypatch.delenv("CF_ACCESS_TEAM_DOMAIN", raising=False)
    monkeypatch.delenv("CF_ACCESS_AUD", raising=False)
    monkeypatch.setattr(access_auth, "_logged_unconfigured", False)
    initial = settings.choice_by_id("anthropic-sonnet")
    server.app.state.llm_choice = LlmChoiceResponse(provider=initial.provider, model=initial.model, label=initial.label, updated_at=settings.now_iso())
    with caplog.at_level("ERROR"):
        first, second = _get(), _get()
        posted = TestClient(server.app).post("/admin/llm", json={"id": "nope"})
    assert first.status_code == second.status_code == posted.status_code == 403
    assert "CF_ACCESS" not in first.text  # the reason stays in the log, not the response
    assert sum("refusing admin requests" in r.message for r in caplog.records) == 1


def test_a_token_is_not_enough_when_the_settings_are_missing(monkeypatch, keypair):
    monkeypatch.delenv("CF_ACCESS_TEAM_DOMAIN", raising=False)
    monkeypatch.delenv("CF_ACCESS_AUD", raising=False)
    assert _get(_token(keypair)).status_code == 403


def test_one_setting_without_the_other_still_refuses(monkeypatch, keypair):
    monkeypatch.setenv("CF_ACCESS_TEAM_DOMAIN", TEAM)
    monkeypatch.delenv("CF_ACCESS_AUD", raising=False)
    assert _get(_token(keypair)).status_code == 403


def test_only_one_of_the_two_settings_counts_as_unconfigured(monkeypatch):
    monkeypatch.setenv("CF_ACCESS_TEAM_DOMAIN", TEAM)
    monkeypatch.delenv("CF_ACCESS_AUD", raising=False)
    assert access_auth._config() is None
