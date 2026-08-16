# TODO: When Home

## 0. Relicense the code to PolyForm Noncommercial — WAITING ON ONE REPLY

**Blocked on:** [@leonardoazeredo](https://github.com/leonardoazeredo) replying to
[#20](https://github.com/Pharkie/ultimate-arr-stack/issues/20). @gncnpk has already agreed.

**Why:** Creative Commons explicitly recommend against CC licences for software — no patent
grant, no source provisions, and "NonCommercial" is loosely defined.
[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/) is the
same posture, drafted for code. Docs would stay CC BY-NC 4.0, which is what CC is good at.

**Why it needs their agreement, not just mine:** they each hold copyright in their own
contributions, licensed to this project under CC BY-NC 4.0. 60 of @gncnpk's lines are still live
(31 in `docker-compose.arr-stack.yml`, 29 in `scripts/configure-apps.sh`), and
@leonardoazeredo's test and script work was upstreamed on 2026-08-15. @eren-kemer needs no
agreement — `git blame` shows zero surviving lines from PR #6.

**When the reply lands:**
- `LICENSE` → PolyForm Noncommercial 1.0.0 for code
- add `LICENSE-docs` → CC BY-NC 4.0, and point the README's License section at both
- note in the README that the change is **forward-only**: the 122 existing forks keep their
  CC BY-NC copies permanently

**If they decline:** nothing breaks. Everything stays CC BY-NC 4.0, which is already properly
stated in `LICENSE` as of 2026-08-15.

> GitHub's licence detector recognises only 13 licences and includes neither CC BY-NC nor
> PolyForm, so the sidebar will keep saying "no licence" either way. That's cosmetic — the
> `LICENSE` file is what has legal effect.

## 1. ~~Fix stuck For All Mankind S05E01 download~~ DONE

Fixed remotely via Seerr — deleted request, re-requested, new download kicked off.

**Follow-up:** Check qBit for orphaned stuck torrent from the old STC release. May need manual cleanup.

## 2. Set up Tailscale for remote admin access

**Problem:** Can't manage Sonarr/qBit/Radarr when away from home. Seerr only shows status, can't fix issues.

**Ideas:**
- Install Tailscale on the NAS (runs as a Docker container)
- Gives full LAN access from phone/laptop anywhere, no port forwarding
- Zero config, no Cloudflare changes needed
- Then all .lan admin UIs accessible remotely via Tailscale IP
- Docs already reference this: `docs/REMOTE-ACCESS.md`
