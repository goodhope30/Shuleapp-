SHULE APP v1.0.0  -  Jinsi ya kuweka (deploy) kwa simu / How to deploy
=====================================================================

1) Cloudflare > Workers & Pages > Create > Pages > "Upload assets".
   Pakia ZIP hii (au folda hii nzima, pamoja na folda ya "functions").
2) KV: Workers & Pages > Storage & Databases > KV > Create namespace (mf. "shule-kv").
3) Kwenye project yako ya Pages: Settings > Bindings (Functions) > Add > KV namespace
   Variable name:  SHULE_KV     Namespace: shule-kv
4) Pakia (upload) ZIP tena ili deployment mpya ichukue binding (Deployments > Create new deployment).
5) Fungua link ya app. Ingia:
   Admin: PIN 1234 | Mwalimu: T-001 / 1234 | Mzazi: STD-001 / 1234
   Badilisha PIN ya Admin kwenye Profile > Mipangilio > PIN Mpya.
6) Futa wanafunzi wa demo: Wanafunzi > "Futa Wanafunzi wa Demo Wote".

Files: index.html, manifest.json, sw.js, icons/, js/, functions/api/[[route]].js
Data zote ziko kwenye KV kama JSON. Hakuna npm/build.
Maelezo: KV ya bure inaruhusu maandishi 1,000 kwa siku; shule kubwa inaweza kuhitaji mpango wa kulipia ($5).
Tailwind inapakiwa kutoka CDN (cdn.tailwindcss.com) mara ya kwanza; baadaye inafanya kazi offline (service worker).
Viungo vya PDF (matokeo/risiti) vinadumu siku 30.
