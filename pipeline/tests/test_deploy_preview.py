"""The preview deploy script, run in its dry-run mode (it prints each step instead of running it), so the order of the
steps and the guards can be checked without a Mac Mini, a network or a build."""
import os
import subprocess
import sys

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
    build = steps(out)[index_of(steps(out), "npm run build")]
    assert "DEPLOY_BASE_PATH=/" in build and build.endswith("npm run build")


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


def test_it_never_rewrites_history_or_pushes_or_acts_on_the_production_jobs(tmp_path):
    _, out, _ = dry_run(tmp_path)
    text = open(SCRIPT).read() + out
    for forbidden in ("reset --hard", "push", "checkout main", "bootout", "unload", "launchctl stop", "launchctl remove"):
        assert forbidden not in text, forbidden
    # launchctl is used for exactly one thing: kickstart of the preview's own job, never one labelled as production
    assert [l for l in text.splitlines() if "launchctl" in l and not l.lstrip().startswith("#") and "kickstart" not in l and "launchctl print" not in l] == []


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


def test_a_plist_that_exists_but_cannot_be_read_is_said_out_loud(tmp_path):
    broken = tmp_path / "broken.plist"
    broken.write_text("not a plist")
    code, _, err = dry_run(tmp_path, PRODUCTION_FRONTEND_PLIST=str(broken))
    assert code == 0 and "warning" in err and "could not read" in err and "guard did not run" in err


def test_a_readable_plist_gives_no_warning(tmp_path):
    other = tmp_path / "elsewhere"
    other.mkdir()
    _, _, err = dry_run(tmp_path, PRODUCTION_FRONTEND_PLIST=fake_job(tmp_path, str(other)))
    assert "warning" not in err
    bare = tmp_path / "bare.plist"
    bare.write_bytes(plistlib.dumps({"Label": "x"}))
    assert "warning" not in dry_run(tmp_path, PRODUCTION_FRONTEND_PLIST=str(bare))[2]


def test_the_comments_do_not_claim_the_type_check_reads_syn_ds_path():
    """tsc -b reads fixed ../../syena-design-system paths in the tsconfig files, so only the setup script, vite and vitest read the variable."""
    setup = open(os.path.join(os.path.dirname(SCRIPT), "..", "..", "climate-dashboard-react", "scripts", "setup-design-system.sh")).read()
    assert "type check read the same variable" not in setup and "tsc -b" in setup
    header = open(SCRIPT).read().split("set -euo pipefail")[0]
    assert "the build and the tests alike" not in header and "tsc -b" in header


# ---------------------------------------------------------------- the preview as a launchd job

def preview_job(tmp_path, working_directory=REPO_APP, port="4273", label="com.ghgemissions.preview"):
    plist = tmp_path / "preview.plist"
    plist.write_bytes(plistlib.dumps({"Label": label, "WorkingDirectory": working_directory,
                                      "ProgramArguments": ["/node", "vite.js", "preview", "--port", port, "--strictPort", "--host", "127.0.0.1"]}))
    return str(plist)


def test_a_preview_job_for_this_checkout_is_restarted_instead_of_starting_a_second_server(tmp_path):
    code, out, err = dry_run(tmp_path, PREVIEW_LAUNCHD_PLIST=preview_job(tmp_path))
    assert code == 0, err
    lines = steps(out)
    assert any(l.startswith("launchctl kickstart -k gui/") and l.endswith("/com.ghgemissions.preview") for l in lines)
    assert not any("vite preview" in l or "kill" in l for l in lines)
    assert index_of(lines, "npm run build") < index_of(lines, "kickstart")


def test_a_job_for_another_folder_or_port_or_the_production_label_is_not_used(tmp_path):
    other = tmp_path / "elsewhere"
    other.mkdir()
    loose = tmp_path / "loose.plist"
    loose.write_bytes(plistlib.dumps({"Label": "com.ghgemissions.preview", "WorkingDirectory": REPO_APP,
                                      "ProgramArguments": ["/node", "vite.js", "preview", "--port", "4273"]}))
    for plist in (preview_job(tmp_path, working_directory=str(other)), preview_job(tmp_path, port="4999"),
                  preview_job(tmp_path, label="com.ghgemissions.vitepreview"), str(loose)):
        code, out, err = dry_run(tmp_path, PREVIEW_LAUNCHD_PLIST=plist)
        assert code == 0 and "warning" in err, err
        assert any("vite preview" in l for l in steps(out)) and not any("kickstart" in l for l in steps(out))


def test_no_preview_job_means_the_server_is_started_here(tmp_path):
    code, out, err = dry_run(tmp_path, PREVIEW_LAUNCHD_PLIST=str(tmp_path / "missing.plist"))
    assert code == 0 and "warning" not in err
    assert any("vite preview" in l for l in steps(out))


def job_run(tmp_path, job_listens_on):
    """A real run of the launchd path with stub launchctl (job pid 4242) and an lsof stub that, like the real one, answers only for the
    pid and address it is asked about: it reports pid 4242 as a listener on `job_listens_on` (None: the job holds no listener at all)."""
    script, bins = make_stub_checkout(tmp_path, "exit 0\n")
    (bins / "launchctl").write_text('#!/bin/bash\n[ "$1" = print ] && printf \'\\tpid = 4242\\n\'\nexit 0\n')
    (bins / "launchctl").chmod(0o755)
    asked = '[ "$*" = "-nP -a -p 4242 -iTCP@127.0.0.1:4273 -sTCP:LISTEN -t" ]'
    listens = "true" if job_listens_on == "127.0.0.1" else "false"
    (bins / "lsof").write_text(f"#!/bin/bash\n{asked} && {listens} && echo 4242\nexit 0\n")
    (bins / "lsof").chmod(0o755)
    app = tmp_path / "repo" / "climate-dashboard-react"
    env = {"PATH": f"{bins}:{os.environ['PATH']}", "HOME": str(tmp_path), "NO_PULL": "1", "PREVIEW_STATE_DIR": str(tmp_path / "state"),
           "PREVIEW_LAUNCHD_PLIST": preview_job(tmp_path, working_directory=str(app))}
    return subprocess.run(["bash", str(script)], capture_output=True, text=True, env=env, timeout=120)


def test_the_restart_counts_only_when_the_job_itself_listens_on_the_probed_address(tmp_path):
    out = job_run(tmp_path, "127.0.0.1")
    assert out.returncode == 0, out.stderr
    assert "pid 4242" in out.stdout and "HTTP 200" in out.stdout


def test_another_server_answering_on_the_port_does_not_make_the_restart_succeed(tmp_path):
    out = job_run(tmp_path, None)  # the job holds no listener; the curl stub answers 200 as the squatter would
    assert out.returncode != 0
    assert "up on" not in out.stdout and "not the one answering" in out.stderr


def test_a_job_listening_on_another_address_does_not_count_while_127_0_0_1_answers(tmp_path):
    out = job_run(tmp_path, "::1")  # job on ::1, an unrelated server on 127.0.0.1 supplies the 200
    assert out.returncode != 0
    assert "up on" not in out.stdout and "not the one answering" in out.stderr


# ---------------------------------------------------------------- the preview's own API job

REPO_ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", ".."))


def api_job(tmp_path, label="com.ghgemissions.previewapi", working_directory=REPO_ROOT, port="8082", with_port=True, name="previewapi.plist", exe="/venv/bin/uvicorn", env=None):
    plist = tmp_path / name
    args = [exe, "api.main:app", "--host", "127.0.0.1"] + (["--port", port] if with_port else [])
    d = {"Label": label, "WorkingDirectory": working_directory, "ProgramArguments": args}
    if env:
        d["EnvironmentVariables"] = env
    plist.write_bytes(plistlib.dumps(d))
    return str(plist)


def test_the_preview_api_job_for_this_checkout_is_restarted_after_the_build_and_before_the_front_end(tmp_path):
    code, out, err = dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=api_job(tmp_path), PREVIEW_LAUNCHD_PLIST=preview_job(tmp_path))
    assert code == 0, err
    lines = steps(out)
    api_kick = next(i for i, l in enumerate(lines) if l.startswith("launchctl kickstart -k gui/") and l.endswith("/com.ghgemissions.previewapi"))
    front_kick = next(i for i, l in enumerate(lines) if l.startswith("launchctl kickstart -k gui/") and l.endswith("/com.ghgemissions.preview"))
    assert index_of(lines, "npm run build") < api_kick < front_kick
    assert any("http://127.0.0.1:8082/api/health" in l for l in lines)


def test_no_preview_api_job_means_the_script_behaves_as_before(tmp_path):
    code, out, err = dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=str(tmp_path / "missing.plist"))
    assert code == 0 and "warning" not in err
    assert not any("previewapi" in l for l in steps(out))


def test_a_job_that_is_not_the_preview_api_or_not_this_checkout_is_left_alone(tmp_path):
    other = tmp_path / "elsewhere"
    other.mkdir()
    # One plist file per scenario: they are all built before the loop runs, so a shared file would leave every iteration testing the last one.
    scenarios = {
        "the production API job": api_job(tmp_path, label="com.ghgemissions.uvicorn", name="production.plist"),
        "another checkout": api_job(tmp_path, working_directory=str(other), name="other-checkout.plist"),
        "no --port": api_job(tmp_path, with_port=False, name="no-port.plist"),
    }
    assert len(set(scenarios.values())) == 3
    for what, plist in scenarios.items():
        code, out, err = dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=plist)
        assert code == 0 and "warning" in err and "leaving it alone" in err, (what, err)
        assert not any("kickstart" in l and "previewapi" in l for l in steps(out)), what
        assert not any(l.endswith("/com.ghgemissions.uvicorn") for l in steps(out)), what
    assert "not the preview's API job (label 'com.ghgemissions.uvicorn')" in dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=scenarios["the production API job"])[2]
    assert "does not run this checkout" in dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=scenarios["another checkout"])[2]
    assert "names no --port" in dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=scenarios["no --port"])[2]


def loaded_definition(args, working_directory, env):
    """What `launchctl print` shows for a loaded job: the command, the working directory and the job's own environment, plus the 'inherited' and 'default' environment
    blocks, which are not the job's and must never be read as its environment."""
    lines = ["\tstate = running", f"\tprogram = {args[0]}", "\targuments = {"] + [f"\t\t{a}" for a in args] + ["\t}"]
    if working_directory:
        lines.append(f"\tworking directory = {working_directory}")
    lines += ["\tinherited environment = {", "\t\tGHG_DATA_DIR => /decoy/inherited", "\t}", "\tdefault environment = {", "\t}", "\tenvironment = {"]
    lines += [f"\t\t{k} => {v}" for k, v in (env or {}).items()] + ["\t}", "\tpid = 5151"]
    return "\n".join(lines) + "\n"


def api_run(tmp_path, api_listens_on, loaded_dir=None, loaded_args=None, loaded_env=None, plist_env=None, preview_env=None, front_loaded_env=None):
    """A real run with both jobs as launchd jobs (stub launchctl: front end pid 4242, API pid 5151) and an lsof stub that answers only for the pid and address it is
    asked about. `api_listens_on`: where pid 5151 listens ('127.0.0.1', '::1', or None for no listener); the front end always listens on 127.0.0.1:4273. The curl
    stub answers 200 to everything, as another server squatting on the API's port would. The LOADED API definition `launchctl print` shows defaults to exactly what the
    plist on disk says (with this checkout as its working directory); `loaded_dir`/`loaded_args`/`loaded_env` change what is loaded ('' dir: none shown), `plist_env`
    what the file's environment says. Every launchctl call is logged to tmp_path/launchctl.log."""
    script, bins = make_stub_checkout(tmp_path, "exit 0\n")
    repo = tmp_path / "repo"
    plist_env = {"GHG_DATA_DIR": "/prod/data"} if plist_env is None else plist_env
    api_plist = api_job(tmp_path, working_directory=str(repo), name="previewapi-real.plist", env=plist_env)
    disk_args = plistlib.load(open(api_plist, "rb"))["ProgramArguments"]
    shown = loaded_definition(loaded_args or disk_args, str(repo) if loaded_dir is None else loaded_dir, plist_env if loaded_env is None else loaded_env)
    (tmp_path / "api-print.txt").write_text(shown)
    log = tmp_path / "launchctl.log"
    (tmp_path / "front-print.txt").write_text("\tpid = 4242\n" + "\tinherited environment = {\n\t\tAPI_PROXY_TARGET => http://decoy.example:1\n\t}\n\tenvironment = {\n"
                                              + "".join(f"\t\t{k} => {v}\n" for k, v in (front_loaded_env or {}).items()) + "\t}\n")
    (bins / "launchctl").write_text(f'#!/bin/bash\necho "$*" >> {log}\n'
                                    f'if [ "$1" = print ]; then case "$*" in *previewapi*) cat {tmp_path / "api-print.txt"};; *) cat {tmp_path / "front-print.txt"};; esac; fi\nexit 0\n')
    (bins / "launchctl").chmod(0o755)
    api_answers = "true" if api_listens_on == "127.0.0.1" else "false"
    (bins / "lsof").write_text("#!/bin/bash\n"
                               '[ "$*" = "-nP -a -p 4242 -iTCP@127.0.0.1:4273 -sTCP:LISTEN -t" ] && echo 4242 && exit 0\n'
                               f'[ "$*" = "-nP -a -p 5151 -iTCP@127.0.0.1:8082 -sTCP:LISTEN -t" ] && {api_answers} && echo 5151\n'
                               "exit 0\n")
    (bins / "lsof").chmod(0o755)
    app = repo / "climate-dashboard-react"
    front = plistlib.loads(open(preview_job(tmp_path, working_directory=str(app)), "rb").read())
    if preview_env is not None:
        front["EnvironmentVariables"] = preview_env
    front_plist = tmp_path / "preview-front.plist"
    front_plist.write_bytes(plistlib.dumps(front))
    env = {"PATH": f"{bins}:{os.environ['PATH']}", "HOME": str(tmp_path), "NO_PULL": "1", "PREVIEW_STATE_DIR": str(tmp_path / "state"),
           "PREVIEW_LAUNCHD_PLIST": str(front_plist), "PREVIEW_API_LAUNCHD_PLIST": api_plist}
    return subprocess.run(["bash", str(script)], capture_output=True, text=True, env=env, timeout=120)


def test_the_api_restart_counts_only_when_the_job_itself_listens_on_the_probed_address(tmp_path):
    out = api_run(tmp_path, "127.0.0.1")
    assert out.returncode == 0, out.stderr
    assert "preview API restarted via com.ghgemissions.previewapi (pid 5151)" in out.stdout and "preview restarted via" in out.stdout


def test_another_server_answering_health_on_the_api_port_does_not_make_the_deploy_succeed(tmp_path):
    out = api_run(tmp_path, None)  # the job holds no listener; the curl stub answers 200 as a squatter on the port would
    assert out.returncode != 0
    assert "preview API restarted" not in out.stdout and "is not the one answering on port 8082" in out.stderr


def test_an_api_job_listening_on_another_address_does_not_count(tmp_path):
    out = api_run(tmp_path, "::1")
    assert out.returncode != 0 and "preview API restarted" not in out.stdout and "is not the one answering" in out.stderr


def no_api_kickstart(tmp_path):
    log = (tmp_path / "launchctl.log").read_text()
    return "kickstart" in log and not any("kickstart" in l and "previewapi" in l for l in log.splitlines())  # the front end's job yes, the API's never


def test_a_loaded_definition_that_matches_the_plist_on_disk_is_restarted(tmp_path):
    out = api_run(tmp_path, "127.0.0.1")
    assert out.returncode == 0, out.stderr
    assert "LOADED definition" not in out.stderr and "preview API restarted" in out.stdout


def test_a_loaded_definition_for_another_checkout_is_left_alone_even_when_the_plist_on_disk_is_right(tmp_path):
    other = tmp_path / "elsewhere"
    other.mkdir()
    out = api_run(tmp_path, "127.0.0.1", loaded_dir=str(other))  # bootstrapped from another checkout; the plist was edited since, without a reload
    assert out.returncode == 0, out.stderr  # the front end is still restarted
    assert "LOADED definition of com.ghgemissions.previewapi" in out.stderr and f"it runs from '{other}', not this checkout" in out.stderr and "needs the job reloaded" in out.stderr or "need the job reloaded" in out.stderr
    assert "preview API restarted" not in out.stdout and no_api_kickstart(tmp_path)


def test_a_loaded_definition_that_cannot_be_verified_is_not_restarted_either(tmp_path):
    out = api_run(tmp_path, "127.0.0.1", loaded_dir="")  # launchctl print shows no working directory
    assert out.returncode == 0 and "an unknown directory" in out.stderr and "preview API restarted" not in out.stdout and no_api_kickstart(tmp_path)


def test_a_loaded_command_that_differs_from_the_plist_is_not_restarted(tmp_path):
    """The interpreter whose packages the drift check inspects comes from the plist; if launchd has another command loaded, the API that would restart is not the one
    that was checked."""
    out = api_run(tmp_path, "127.0.0.1", loaded_args=["/old/venv/bin/uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "8082"])
    assert out.returncode == 0 and "its loaded command differs from the plist on disk" in out.stderr
    assert "preview API restarted" not in out.stdout and no_api_kickstart(tmp_path)


def test_a_loaded_data_directory_that_differs_from_the_plist_is_not_restarted(tmp_path):
    out = api_run(tmp_path, "127.0.0.1", loaded_env={"GHG_DATA_DIR": "/some/other/data"})
    assert out.returncode == 0 and "its loaded GHG_DATA_DIR differs from the plist on disk" in out.stderr
    assert "preview API restarted" not in out.stdout and no_api_kickstart(tmp_path)


def test_only_the_jobs_own_environment_block_counts_not_the_inherited_one(tmp_path):
    # The stub prints GHG_DATA_DIR => /decoy/inherited in the *inherited* block. A plist without the variable and a job environment without it must agree; the decoy must not make them differ.
    out = api_run(tmp_path, "127.0.0.1", plist_env={"OTHER": "1"}, loaded_env={"OTHER": "1"})
    assert out.returncode == 0 and "GHG_DATA_DIR differs" not in out.stderr and "preview API restarted" in out.stdout


# --- the preview API's own Python environment: checked against requirements.txt, never modified ---

def venv_with_python(tmp_path, prints):
    """A fake environment folder whose `python` prints what the drift check would print."""
    bin_dir = tmp_path / "preview-venv" / "bin"
    bin_dir.mkdir(parents=True)
    (bin_dir / "uvicorn").write_text("#!/bin/bash\nexit 0\n")
    (bin_dir / "python").write_text(f"#!/bin/bash\necho '{prints}'\n")
    for f in bin_dir.iterdir():
        f.chmod(0o755)
    return str(bin_dir / "uvicorn")


def test_a_preview_api_environment_behind_requirements_is_said_out_loud_but_does_not_stop_the_deploy(tmp_path):
    exe = venv_with_python(tmp_path, "pandas 3.0.3 (requirements.txt wants 2.3.0); numpy missing (requirements.txt wants 2.3.5)")
    code, out, err = dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=api_job(tmp_path, exe=exe))
    assert code == 0, err
    assert "differs from requirements.txt: pandas 3.0.3 (requirements.txt wants 2.3.0); numpy missing" in err
    assert "Install requirements.txt into that environment" in err
    assert any(l.startswith("launchctl kickstart -k gui/") and l.endswith("/com.ghgemissions.previewapi") for l in steps(out))


def test_an_environment_that_matches_requirements_or_cannot_be_inspected_says_nothing(tmp_path):
    exe = venv_with_python(tmp_path, "")
    code, _, err = dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=api_job(tmp_path, exe=exe))
    assert code == 0 and "differs from requirements.txt" not in err
    code, _, err = dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=api_job(tmp_path, exe="/nonexistent/venv/bin/uvicorn", name="gone.plist"))
    assert code == 0 and "differs from requirements.txt" not in err


def drift(tmp_path, requirements):
    """The embedded check, run for real with this interpreter against a requirements file."""
    text = open(SCRIPT).read()
    snippet = text.split("<<'PY' 2>/dev/null || true\nimport re, sys")[1].split("\nPY\n)")[0]
    req = tmp_path / "requirements.txt"
    req.write_text(requirements)
    done = subprocess.run([sys.executable, "-c", "import re, sys" + snippet, str(req)], capture_output=True, text=True)
    assert done.returncode == 0, done.stderr
    return done.stdout.strip()


def test_the_drift_check_reads_requirements_with_the_real_interpreter_and_never_installs(tmp_path):
    """Against this repository's own requirements.txt: every pin parses, and nothing is installed."""
    out = subprocess.run([sys.executable, "-c", "pass"], capture_output=True)  # the interpreter works
    assert out.returncode == 0
    result = drift(tmp_path, open(os.path.join(REPO_ROOT, "requirements.txt")).read())
    assert all(part.count("requirements.txt wants") == 1 for part in result.split("; ") if part)
    text = open(SCRIPT).read()
    assert "pip install" not in text and "pip3 install" not in text


def test_the_drift_check_understands_minimum_versions_as_well_as_exact_pins(tmp_path):
    assert drift(tmp_path, "pytest>=1.0\n") == ""  # installed and at least that
    assert drift(tmp_path, "pytest>=9999.0\n").startswith("pytest ") and "requirements.txt wants at least 9999.0" in drift(tmp_path, "pytest>=9999.0\n")
    assert drift(tmp_path, "definitely-not-installed-xyz>=1.0\n") == "definitely-not-installed-xyz missing (requirements.txt wants at least 1.0)"
    assert drift(tmp_path, "definitely-not-installed-xyz==1.0\n") == "definitely-not-installed-xyz missing (requirements.txt wants 1.0)"
    assert drift(tmp_path, "pytest==0.0.1\n").endswith("(requirements.txt wants 0.0.1)")
    assert drift(tmp_path, "# a comment\n\npytest>=1.0\n") == ""
    both = drift(tmp_path, "definitely-not-installed-a>=2\ndefinitely-not-installed-b==3\n")
    assert "definitely-not-installed-a" in both and "definitely-not-installed-b" in both


# --- the proxy target travels with the preview API ---

def test_the_fallback_front_end_is_started_with_the_preview_apis_proxy_target(tmp_path):
    code, out, err = dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=api_job(tmp_path), PREVIEW_LAUNCHD_PLIST=str(tmp_path / "missing.plist"))
    assert code == 0, err
    assert any("PREVIEW_NOINDEX=1 API_PROXY_TARGET=http://127.0.0.1:8082 nohup" in l and "vite preview" in l for l in steps(out))


def test_without_a_preview_api_job_the_fallback_front_end_has_no_proxy_target(tmp_path):
    code, out, err = dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=str(tmp_path / "missing.plist"), PREVIEW_LAUNCHD_PLIST=str(tmp_path / "missing.plist"))
    assert code == 0 and not any("API_PROXY_TARGET" in l for l in steps(out))
    assert any("PREVIEW_NOINDEX=1 nohup" in l for l in steps(out))


def test_the_front_end_job_is_warned_about_when_its_plist_does_not_point_at_the_preview_api(tmp_path):
    api = api_job(tmp_path)
    pointing = tmp_path / "front-ok.plist"
    pointing.write_bytes(plistlib.dumps({"Label": "com.ghgemissions.preview", "WorkingDirectory": REPO_APP, "EnvironmentVariables": {"API_PROXY_TARGET": "http://127.0.0.1:8082"},
                                         "ProgramArguments": ["/node", "vite.js", "preview", "--port", "4273", "--strictPort", "--host", "127.0.0.1"]}))
    code, _, err = dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=api, PREVIEW_LAUNCHD_PLIST=str(pointing))
    assert code == 0 and "API_PROXY_TARGET" not in err
    code, _, err = dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=api, PREVIEW_LAUNCHD_PLIST=preview_job(tmp_path))  # no API_PROXY_TARGET in it
    assert code == 0 and "will still call production's API" in err and "API_PROXY_TARGET=http://127.0.0.1:8082" in err


# --- Copilot review of #134, round 4 ---

TARGET = "http://127.0.0.1:8082"


def test_the_front_ends_loaded_environment_is_checked_not_only_its_plist(tmp_path):
    ok = api_run(tmp_path, "127.0.0.1", preview_env={"API_PROXY_TARGET": TARGET}, front_loaded_env={"API_PROXY_TARGET": TARGET})
    assert ok.returncode == 0 and "will still call production's API" not in ok.stderr
    # Added to the plist but never loaded: `kickstart` runs the loaded environment, so the front end still calls production. (The inherited-environment decoy must not count.)
    second = tmp_path / "second"
    second.mkdir()
    out = api_run(second, "127.0.0.1", preview_env={"API_PROXY_TARGET": TARGET}, front_loaded_env={})
    assert out.returncode == 0 and "will still call production's API" in out.stderr and "loaded: 'unset'" in out.stderr and f"plist: '{TARGET}'" in out.stderr


def test_a_front_end_with_no_target_at_all_is_warned_about(tmp_path):
    out = api_run(tmp_path, "127.0.0.1")
    assert out.returncode == 0 and "will still call production's API" in out.stderr and "plist: 'unset'; loaded: 'unset'" in out.stderr


def test_an_unverified_preview_api_does_not_silently_switch_the_fallback_front_end_to_production(tmp_path):
    other = tmp_path / "elsewhere"
    other.mkdir()
    code, out, err = dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=api_job(tmp_path, working_directory=str(other)), PREVIEW_LAUNCHD_PLIST=str(tmp_path / "missing.plist"))
    assert code == 0
    assert "front end started here will call PRODUCTION's API" in err
    assert not any("API_PROXY_TARGET" in l for l in steps(out))  # and it really is started without a target


def test_no_preview_api_configured_means_no_such_warning(tmp_path):
    code, _, err = dry_run(tmp_path, PREVIEW_API_LAUNCHD_PLIST=str(tmp_path / "missing.plist"), PREVIEW_LAUNCHD_PLIST=str(tmp_path / "missing.plist"))
    assert code == 0 and "PRODUCTION's API" not in err


def patched_drift(tmp_path, requirements, installed, no_packaging=False):
    """The embedded check, run for real with the installed versions faked, so a prerelease installed version can be tested. `no_packaging` forces its own fallback comparison."""
    text = open(SCRIPT).read()
    snippet = "import re, sys" + text.split("<<'PY' 2>/dev/null || true\nimport re, sys")[1].split("\nPY\n)")[0]
    req = tmp_path / "requirements.txt"
    req.write_text(requirements)
    prelude = ("import sys\n" + ("sys.modules['packaging'] = None\nsys.modules['packaging.version'] = None\n" if no_packaging else "")
               + f"import importlib.metadata as _m\n_fake = {installed!r}\n"
               + "def _v(name):\n    if name not in _fake:\n        raise _m.PackageNotFoundError(name)\n    return _fake[name]\n_m.version = _v\n")
    done = subprocess.run([sys.executable, "-c", prelude + snippet, str(req)], capture_output=True, text=True)
    assert done.returncode == 0, done.stderr
    return done.stdout.strip()


import pytest  # noqa: E402


@pytest.mark.parametrize("no_packaging", [False, True], ids=["packaging", "fallback"])
def test_minimums_follow_pep_440_prereleases_below_the_floor_are_below(tmp_path, no_packaging):
    def behind(floor, have):
        return patched_drift(tmp_path, f"pkg>={floor}\n", {"pkg": have}, no_packaging) != ""

    assert behind("4.5.11", "4.5.11rc1")  # the reviewer's example: a prerelease is below its release
    assert behind("4.5.11", "4.5.11a1") and behind("4.5.11", "4.5.11.dev3") and behind("4.5.11", "4.5.10")
    assert not behind("4.5.11", "4.5.11") and not behind("4.5.11", "4.5.12") and not behind("4.5.11", "4.6")
    assert not behind("4.14.2", "4.14.2.post1")  # a post-release is not below
    assert not behind("4.5.0", "4.5") and not behind("4.5", "4.5.0")  # trailing zeros do not matter
    assert not behind("1.0rc1", "1.0")  # a release is above its own prerelease floor


@pytest.mark.parametrize("no_packaging", [False, True], ids=["packaging", "fallback"])
def test_exact_pins_and_missing_packages_are_unaffected_by_the_comparison(tmp_path, no_packaging):
    assert patched_drift(tmp_path, "pkg==1.2.3\n", {"pkg": "1.2.3"}, no_packaging) == ""
    assert patched_drift(tmp_path, "pkg==1.2.3\n", {"pkg": "1.2.4"}, no_packaging) == "pkg 1.2.4 (requirements.txt wants 1.2.3)"
    assert patched_drift(tmp_path, "pkg>=1\n", {}, no_packaging) == "pkg missing (requirements.txt wants at least 1)"
