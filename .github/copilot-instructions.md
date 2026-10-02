# Project guidance

- Keep this app static with no build step; Supabase JS may load only when account config is present.
- Do not add Base44 SDKs, branding, scripts, or API requirements.
- Keep financial records user-scoped with Supabase RLS; never seed or commit personal financial records.
- Never expose Supabase `service_role` keys or other private credentials in browser code.
- Preserve Portuguese (Brazil) labels, keyboard access, responsive layouts, and the existing visual system.
