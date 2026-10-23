"""deploy/launchd/render.sh fills in secrets-adjacent values (the Cloudflare Access team and audience, the paths of the key files), so what it
writes must be readable by its owner only, like the live plists it stands in for."""
import os
import stat
import subprocess

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "..", "deploy", "launchd", "render.sh")


def render(tmp_path):
    out = tmp_path / "rendered"
    env = {
        "PATH": os.environ["PATH"],
        "HOME": str(tmp_path),
        "REPO_DIR": str(tmp_path / "repo"),
        "CF_ACCESS_TEAM_DOMAIN": "team.example.test",
        "CF_ACCESS_AUD": "a" * 32,
        "ANTHROPIC_KEY_FILE": str(tmp_path / "key"),
        "LLM_PROVIDER": "anthropic",
        "LOCAL_LLM_MODEL": "model",
        "NTFY_TOPIC_FILE": str(tmp_path / "topic"),
        "TUNNEL_TOKEN_FILE": str(tmp_path / "token"),
    }
    done = subprocess.run(["bash", SCRIPT, str(out)], capture_output=True, text=True, env=env)
    return done, out


def mode(path):
    return stat.S_IMODE(os.stat(path).st_mode)


def test_the_rendered_plists_and_their_folder_are_private_to_the_owner(tmp_path):
    done, out = render(tmp_path)
    assert done.returncode == 0, done.stderr
    files = sorted(out.glob("*.plist"))
    assert len(files) == 6
    assert mode(out) == 0o700
    assert all(mode(f) == 0o600 for f in files), {f.name: oct(mode(f)) for f in files}


def test_an_existing_open_folder_is_closed_too(tmp_path):
    out = tmp_path / "rendered"
    out.mkdir()
    out.chmod(0o755)
    done, _ = render(tmp_path)
    assert done.returncode == 0, done.stderr
    assert mode(out) == 0o700
