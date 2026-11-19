# RutaCAP — R69: intento único de Preview protegido, cancelado por Ignored Build Step

Fecha: 20/11/2026 (19/11 UTC).
Rama: feat/cap-commercial. PR #21 OPEN DRAFT, sin merge.
Commit funcional elegido: 254298f85afc487182a66e1030a6fa7ab36fdbd3.
Último HEAD documental anterior: 0bb1dd8000c54a8f58c7c77486fc123433417826.

## Autorización y alcance

Se autorizó explícitamente **una única Preview protegida**, no producción,
sin cambiar la configuración persistente ni el código, SW, main, Supabase
o los datos. El proyecto y el equipo quedaron confirmados:

- Vercel team: cuaderno-tecnico-team, team_C7jTTBhmxsEP0pH8WiJDpfUO.
- Project: cap-test-pruebas, prj_dXWmcfMTkLObA6JkwSz3mYtDoIbk.
- Vite/Node 22.x, deployment protection Vercel Authentication habilitada.
- CI #560 SUCCESS para el SHA funcional y 37/37 pasos.
- Tres builds READY previos mostraban exactamente
  \`build:preview\` y \`vite build --mode cap-preview\`.
- Se optó por Git Source con SHA exacto y configuración de proyecto
  existente, sin enviar projectSettings, sin cambiar variables y
  omitiendo target para usar Preview por defecto.

## Operación realizada y resultado

La primera petición incluyó erróneamente \`target:"preview"\` y Vercel
la rechazó con HTTP 400 por valor inválido; **no creó deployment**.

La petición corregida, sin campo \`target\`, creó **un único deployment**:

- ID: dpl_4TojQJZ4sGcnhC2h8fVWHZBngndH
- URL asignada: cap-test-pruebas-9rt0jm2qs-cuaderno-tecnico-team.vercel.app
- SHA: 254298f85afc487182a66e1030a6fa7ab36fdbd3
- Entorno: Preview (target null en API)
- Estado final: **CANCELED**
- Build log:
  - Running "exit 0"
  - The deployment was canceled because the Ignored Build Step command
    returned exit code 0.

Este comportamiento es intencional en el proyecto para impedir los
despliegues automáticos; \`forceNew=1\` NO omite el Ignored Build Step.
**No se creó una Preview READY, no se desplegó ningún artefacto nuevo
ni se publicó producción.** No se debe presentar esta URL cancelada
como accesible para prueba física.

Verificación tras el intento: main, rama y PR siguen iguales;
SSO activo \`all_except_custom_domains\`; configuración de Vercel
no modificada.

## Recuperación posible, NO EJECUTADA

La documentación de Vercel permite, desde el diálogo de **Redeploy**,
desmarcar **Use project's Ignore Build Step** para saltarse la regla
en **una sola reconstrucción**, sin cambiar permanentemente el comando.
También se puede usar el artefacto CI precompilado, siempre que se
controle la vía de publicación y no se debilite la protección.

**La autorización anterior era para una única Preview, y esa petición
se consumió en el intento cancelado.** No se ha creado un segundo
deployment ni se ha alterado el Ignored Build Step. Antes de un nuevo
intento se requiere consentimiento expreso para una segunda operación
de Preview protegida, garantizando omisión temporal de dicha regla.

Link de inspección de la solicitud cancelada:
https://vercel.com/cuaderno-tecnico-team/cap-test-pruebas/4TojQJZ4sGcnhC2h8fVWHZBngndH

## Alternativa física inmediata sin deploy

Se descargó el artefacto auténtico de GitHub Actions #560:

- cap-test-pro-commercial-preview (1.842.564 bytes, ZIP).
- Integridad ZIP CRC validada.
- 75 entradas, 62 ficheros data/, 33 cuestionarios del banco y
  26 exámenes históricos. Sin expedientes \`editorial_casebook\`.
- \`preview-build.json\`: mode=cap-preview, commit=254298f85...,
  ref=refs/heads/feat/cap-commercial, cloudSync=false, deployed=false.
- Compatible con el procedimiento local Windows \`INICIAR-PREVIEW.cmd\`
  y Python 3 en 127.0.0.1:4178.

## Estado

R69: DEPLOYMENT CANCELED BY INTENTIONAL IGNORE RULE.
La protección, main, R58, Supabase y producción siguen intactos.
No merge. Nueva Preview protegida pendiente de autorización.
