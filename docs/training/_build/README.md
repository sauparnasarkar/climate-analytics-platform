# Building the training PDFs

Regenerates every `docs/training/**/*.pdf` (technical and functional series, plus the landing page) from its `.md` source.

```bash
docs/training/_build/build.sh              # all docs (or pass specific paths, relative to docs/training)
python3 docs/training/_build/links.py      # rewrite links, write final PDFs next to the .md files
```

Requires `pandoc`, Google Chrome (macOS default path), `pypdf`, and internet access (Mermaid loads from a CDN).
Intermediate HTML and raw PDFs go to `_build/out/` (gitignored). `links.py` needs raw PDFs for **all** docs,
so run a full `build.sh` before it. `build.sh` prints `PANDOC FAIL` / `CHROME FAIL` per file; `links.py`
should end with `problems 0`.

## After a reference update

When an entry in `pipeline/references.json` changes (the IPCC AR6 TCRE range, the Paris temperature goals; SPEC.md §5.35), re-check the
pages that quote it, in particular `functional/03-benchmarks/`, and regenerate their PDFs as above.
