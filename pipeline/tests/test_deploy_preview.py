"""The preview deploy script, run in its dry-run mode (it prints each step instead of running it), so the order of the
steps and the guards can be checked without a Mac Mini, a network or a build."""
import os
import subprocess

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "..", "deploy", "preview", "deploy-preview.sh")


def dry_run(tmp_path, **env):
    full = {"PATH": os.environ["PATH"], "HOME": str(tmp_path), "DRY_RUN": "1", **env}
    out = subprocess.run(["bash", SCRIPT], capture_output=True, text=True, env=full)
    return out.returncode, out.stdout, out.stderr


def steps(stdout):
    return [line[2:] for line in stdout.splitlines() if line.startswith("+ ")]


def index_of(lines, needle):
    hits = [i for i, line in enumerate(lines) if needle in line]
    assert hits, f"no step contains {needle!r}: {lines}"
    return hits[0]


def test_the_steps_run_in_the_order_pull_design_system_install_build_restart(tmp_path):
    code, out, err = dry_run(tmp_path)
    assert code == 0, err
    lines = steps(out)
    order = [index_of(lines, n) for n in ("pull --ff-only", "setup-design-system.sh", "npm ci", "npm run build", "vite preview")]
    assert order == sorted(order)


def test_the_design_system_is_set_up_by_the_pin_script_not_cloned_by_hand(tmp_path):
    _, out, _ = dry_run(tmp_path)
    lines = steps(out)
    assert any(l.endswith("scripts/setup-design-system.sh") for l in lines)
    assert not any("git clone" in l for l in lines)


def test_the_build_bakes_in_the_root_base_path(tmp_path):
    _, out, _ = dry_run(tmp_path)
    assert "DEPLOY_BASE_PATH=/ npm run build" in " ".join(steps(out))


def test_the_pull_only_fast_forwards_and_can_be_skipped(tmp_path):
    _, out, _ = dry_run(tmp_path)
    assert any("git -C" in l and "pull --ff-only" in l for l in steps(out))
    _, out, _ = dry_run(tmp_path, NO_PULL="1")
    assert not any(" pull" in l for l in steps(out))


def test_the_preview_listens_on_loopback_on_its_own_port_and_asks_not_to_be_indexed(tmp_path):
    _, out, _ = dry_run(tmp_path)
    start = steps(out)[index_of(steps(out), "vite preview")]
    assert "--port 4273" in start and "--strictPort" in start and "--host 127.0.0.1" in start
    assert "PREVIEW_NOINDEX=1" in start
    _, out, _ = dry_run(tmp_path, PREVIEW_PORT="4999")
    assert "--port 4999" in " ".join(steps(out))


def test_it_refuses_the_production_front_ends_port(tmp_path):
    code, out, err = dry_run(tmp_path, PREVIEW_PORT="4173")
    assert code != 0
    assert "production" in err and steps(out) == []


def test_it_never_touches_the_launchd_jobs_or_rewrites_history_or_pushes(tmp_path):
    _, out, _ = dry_run(tmp_path)
    text = open(SCRIPT).read() + out
    for forbidden in ("launchctl", "reset --hard", "push", "checkout main"):
        assert forbidden not in text, forbidden


def test_a_dry_run_changes_nothing_on_disk(tmp_path):
    dry_run(tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_it_only_stops_a_process_it_started_for_this_port(tmp_path):
    _, out, _ = dry_run(tmp_path)
    stop = [l for l in steps(out) if "kill" in l]
    assert stop and "preview.pid" in stop[0] and "vite" in stop[0] and "--port 4273" in stop[0]


# --- a real (not dry) run, with stub npm, curl and vite so no network, build or server is needed ---------------------------

def make_stub_checkout(tmp_path, vite_body):
    """A copy of the script in a minimal repo layout, plus stub binaries first on PATH."""
    repo = tmp_path / "repo"
    (repo / "deploy" / "preview").mkdir(parents=True)
    script = repo / "deploy" / "preview" / "deploy-preview.sh"
    script.write_text(open(SCRIPT).read())
    script.chmod(0o755)
    app = repo / "climate-dashboard-react"
    (app / "scripts").mkdir(parents=True)
    (app / "scripts" / "setup-design-system.sh").write_text("#!/bin/bash\nexit 0\n")
    (app / "scripts" / "setup-design-system.sh").chmod(0o755)
    (app / "node_modules" / ".bin").mkdir(parents=True)
    vite = app / "node_modules" / ".bin" / "vite"
    vite.write_text("#!/bin/bash\n" + vite_body)
    vite.chmod(0o755)
    bins = tmp_path / "bin"
    bins.mkdir()
    for name, body in {"npm": "exit 0\n", "curl": "printf 200\n"}.items():
        (bins / name).write_text("#!/bin/bash\n" + body)
        (bins / name).chmod(0o755)
    return script, bins


def real_run(tmp_path, script, bins):
    env = {"PATH": f"{bins}:{os.environ['PATH']}", "HOME": str(tmp_path), "NO_PULL": "1", "PREVIEW_STATE_DIR": str(tmp_path / "state")}
    return subprocess.run(["bash", str(script)], capture_output=True, text=True, env=env, timeout=60)


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def test_a_second_run_stops_the_server_the_first_run_started_and_records_the_new_one(tmp_path):
    script, bins = make_stub_checkout(tmp_path, 'sleep 30 &\nwait\n')
    pidfile = tmp_path / "state" / "preview.pid"
    first = pid = None
    try:
        assert real_run(tmp_path, script, bins).returncode == 0
        first = int(pidfile.read_text())
        assert alive(first)
        out = real_run(tmp_path, script, bins)
        assert out.returncode == 0, out.stderr
        pid = int(pidfile.read_text())
        assert pid != first and alive(pid)
        for _ in range(20):
            if not alive(first):
                break
            subprocess.run(["sleep", "0.2"])
        assert not alive(first), "the first server is still running"
        cmd = subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True).stdout
        assert "node_modules/.bin/vite preview" in cmd and "--port 4273" in cmd
    finally:
        for p in (first, pid):
            if p and alive(p):
                os.kill(p, 15)


def test_it_fails_when_the_server_it_started_dies_even_if_something_else_answers_on_the_port(tmp_path):
    script, bins = make_stub_checkout(tmp_path, 'echo "port in use" >&2\nexit 1\n')  # curl stub answers 200 as the old server would
    out = real_run(tmp_path, script, bins)
    assert out.returncode != 0
    assert "up on" not in out.stdout


# ---------------------------------------------------------------- the guard: never rebuild the folder the production front-end job serves

import plistlib

REPO_APP = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", "climate-dashboard-react"))


def fake_job(tmp_path, working_directory):
    plist = tmp_path / "frontend.plist"
    plist.write_bytes(plistlib.dumps({"Label": "com.ghgemissions.vitepreview", "WorkingDirectory": working_directory}))
    return str(plist)


def test_it_refuses_to_run_in_the_folder_the_production_front_end_job_serves(tmp_path):
    code, out, err = dry_run(tmp_path, PRODUCTION_FRONTEND_PLIST=fake_job(tmp_path, REPO_APP))
    assert code == 2
    assert "production front-end" in err and "separate clone" in err
    assert steps(out) == []  # refused before any step, even in dry-run mode


def test_the_comparison_follows_symlinks_and_trailing_slashes(tmp_path):
    link = tmp_path / "link"
    link.symlink_to(REPO_APP)
    code, _, err = dry_run(tmp_path, PRODUCTION_FRONTEND_PLIST=fake_job(tmp_path, str(link) + "/"))
    assert code == 2 and "production front-end" in err


def test_a_clone_elsewhere_runs_normally_when_the_production_job_serves_another_folder(tmp_path):
    other = tmp_path / "production" / "climate-dashboard-react"
    other.mkdir(parents=True)
    code, out, err = dry_run(tmp_path, PRODUCTION_FRONTEND_PLIST=fake_job(tmp_path, str(other)))
    assert code == 0, err
    assert any("npm run build" in l for l in steps(out))


def test_no_production_job_on_the_machine_means_no_guard(tmp_path):
    code, _, err = dry_run(tmp_path, PRODUCTION_FRONTEND_PLIST=str(tmp_path / "missing.plist"))
    assert code == 0, err


def test_a_plist_without_a_working_directory_or_a_broken_one_does_not_block(tmp_path):
    broken = tmp_path / "broken.plist"
    broken.write_text("not a plist")
    assert dry_run(tmp_path, PRODUCTION_FRONTEND_PLIST=str(broken))[0] == 0
    bare = tmp_path / "bare.plist"
    bare.write_bytes(plistlib.dumps({"Label": "x"}))
    assert dry_run(tmp_path, PRODUCTION_FRONTEND_PLIST=str(bare))[0] == 0
