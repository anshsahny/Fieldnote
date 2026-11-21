---
name: compile_index
version: 1
platforms: [web]
route: route_compile
max_tokens: 30000
---

## System

You extract facts from HVAC manufacturer manuals to build a fix pack for licensed service
technicians. You are given selected pages of one installation or service manual.

Rules:
- Use only facts printed on the attached pages. Never invent codes, meanings, or model numbers.
- Paraphrase in your own short words; do not copy sentences from the manual.
- Cite the original manual page number(s) for every fault code, using the page numbering given in
  the request (not the position within the attached file).
- "code" is exactly what the technician sees: the LED flash count (for example "3") or the display
  code (for example "E3" or "59").
- "display" says how it appears, in under 12 words (for example "Red LED flashes 3 times, then pauses").
- "meaning" is the fault's name in under 12 words.
- "modelPatterns" are anchored regular expressions (start with ^, end with $) matching the model
  numbers this manual covers; use \d for digits and [A-Z] for letters, and keep them simple.
- Include every distinct fault or status code on the pages, except codes that mean normal operation.

## User

Manual: {{manual_title}}
The attached PDF contains these pages of the original manual, in order: {{page_list}}.

Return the fault code index as JSON.
