# Portfolio Review — Handoff Notes

**Site:** https://putintsev.io
**Owner:** Anton Putintsev, PhD — optical/polariton computing, Skoltech Senior Research Engineer
**Goal:** Apply to Google, Nvidia, Micron and similar AI-hardware companies
**Target roles:** Open — anything adjacent to expertise (Research Scientist, Hardware/Silicon, Applied Scientist)
**Relocation:** Open to relocate, needs visa sponsorship

---

## Recruiter 30-second takeaway

First hit is strong: PhD physicist, Nature Communications, "Building AI hardware with light", optical computing. The tldr bridges physics → AI hardware cleanly.

The page currently reads as **an academic portfolio with an AI-hardware label on top**, not as a candidate who has already crossed into industry. Fine for Research Scientist tracks (Nvidia Research, Google Research, Micron advanced tech). For silicon, applied ML, or accelerator-software roles, the distance is visible and the page doesn't close it.

---

## Strong sides (keep and amplify)

- **"First in the world" framing** — cascadable room-temperature polariton logic gates. Keep this prominent. Unique signal is the most valuable asset on the page.
- **Quantified bullets** — $340K grants, 1000× faster switching, 100+ GB/day, 5× iteration speedup. Industry language, unusually good for a physics CV.
- **Publication record** — Nature Comms + 2× PRL (one Editor's Suggestion) + APL Editor's Choice. Elite, and directly maps to O-1 / EB-1A visa criteria.
- **Media coverage section** — external validation, seven outlets across languages.
- **Timeline** — fast visual scan of career progression.
- **Hardware-software co-design language** — signals not-a-pure-theorist.

---

## Weak sides (to fix)

1. **Positioning too narrow.** Current line "Seeking to apply optical computing expertise to next-generation AI accelerator development" signals one path only. Blocks consideration for silicon photonics, compute-in-memory, GPU/CUDA-adjacent roles.
2. **No code / no GitHub / no demos.** Lists Python, C/C++, LabVIEW, FPGA interfaces — nothing clickable. Red flag for Nvidia and Google non-research tracks.
3. **Skills section has filler.** "Math/Physics/Statistics" obvious for a physics PhD. "Communications, negotiations, Critical thinking" reads as padding. Typo: "Comunications". Inconsistent capitalization.
4. **No AI/ML surface.** Zero mention of PyTorch, CUDA, model training, inference. Table stakes for AI-hardware non-research roles.
5. **Availability / visa status invisible.** No relocation note, timezone, or "available from [date]". Moscow-based → US recruiter has to guess feasibility in 5 seconds.
6. **Publications flat, no hierarchy.** 7 papers at equal visual weight. A recruiter reads two. Promote Nature Comms + PRLs; deprioritize the rest.
7. **Broken image / empty block** in the "PRB Letter" media section — clutter.
8. **Site is template-level static.** Fine for research, but for engineering-adjacent roles the site *is* a hiring signal. A polished interactive demo would punch above its weight.

---

## Action items — prioritized by impact

### P0 — do first

- [ ] **Rewrite the headline ask.** Add a clear availability/openness block near the top:
  > *"Open to Research Scientist, Silicon Photonics, and Hardware R&D roles at AI-hardware companies. Available [date]. Open to relocation; eligible for O-1/EB-1A visa pathways."*
  Solves: role scope, geography, visa — in one block.

- [ ] **Ship a GitHub (2–3 repos minimum).**
  - Acquisition pipeline (Python, clean version)
  - Polariton gate simulation notebook (Jupyter, plots, markdown explanation)
  - Lindblad microscopic model from the 240 GHz paper
  Link prominently in header with LinkedIn/Email.

- [ ] **Write one "bridge" project page.**
  Pick the polariton logic gate work. Rewrite as product/engineering case study: *Problem → Approach → Result → Implications for AI hardware*. One page, plain language, one good diagram. This is what lets a recruiter forward you internally.

### P1 — do this week

- [ ] **Rewrite skills section.** Cut filler. Be specific:
  - Add: CUDA (if touched), PyTorch (if touched), Verilog/FPGA specifics, NumPy/SciPy/xarray, git, HPC/cluster experience
  - Remove: Math, Physics, Statistics (implicit), Communications/negotiations/critical-thinking padding
  - Fix "Comunications" typo and capitalization

- [ ] **Add visible publication hierarchy.** Nature Comms and PRLs get visual weight (larger, different color block, or "Featured" label). Rest collapsed or smaller.

- [ ] **Surface the GYSS Singapore invitation** into its own "Talks / Invited" section or badge — currently buried in timeline.

- [ ] **Fix media section.** Remove empty image block in PRB Letter. Consolidate the 7 language variants per paper into a single collapsible "Press coverage" list under each main publication.

### P2 — polish

- [ ] Test the Contact form with a real submission.
- [ ] Add a small interactive demo (polariton gate visualization, or refractive index modulation toy). Even a simple D3/Three.js thing.
- [ ] Add a downloadable one-pager version of the CV tuned for industry (not the academic CV).
- [ ] Favicon + OG image check for link-unfurl quality when shared.

---

## Per-company tailoring notes (for cover letters)

- **Nvidia** → cuLitho (GPU-accelerated computational lithography) is photonics-adjacent and a natural crossover. Also Nvidia Research. Mention CUDA if any exposure.
- **Micron** → heavy investment in compute-in-memory / near-memory processing. Frame polariton work as "non-von-Neumann computing architecture experience".
- **Google** → Google Research, Quantum AI (non-von-Neumann angle), TPU team for hardware. Mention experimental systems + real-time control stack.
- **Also apply in parallel (harder but realistic):** ASML, imec, Samsung Advanced Institute, TSMC R&D, NTT Research, RIKEN, Cambridge-based photonic-computing startups (Lightmatter, Lightelligence, Salience Labs).

---

## Context note on Skoltech → US AI-hardware path

Harder than résumé alone suggests. Skoltech appears on certain US compliance watchlists; RSF grants are Russian-government-funded. Export control and security review will add friction even when the recruiter is enthusiastic. Not a dealbreaker — O-1 is achievable with this publication record — but:

- Apply broadly to EU/UK/Asia in parallel. Path may go through a 1–2 year EU stint first.
- Prepare proactive export-control answer: what was worked on, what was dual-use, documentation available.
- Research-heavy divisions (Nvidia Research, MSR, Google Research) are most forgiving of complicated cases because hiring is publication-weighted and visa teams are experienced.

---

## Next working session — start here

1. Clone/pull the repo, show me the structure.
2. Start with **P0 item 1** (headline rewrite) — smallest edit, highest visibility.
3. Then **P0 item 3** (bridge project page) — biggest leverage for recruiter forwarding.
4. GitHub repos can be a parallel track between sessions.

Paste this file into the project directory. When we resume, I'll read it first and pick up from the "Next working session" block.
