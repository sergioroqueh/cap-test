#!/usr/bin/env python3
"""R79: generador local de páginas legales para el VPS RutaCAP.

No transmite datos, no modifica DNS/Caddy y NO sube DNI/domicilio a GitHub.
Las páginas generadas SÍ son públicas si Caddy sirve la carpeta de salida.
Revisar los textos con un profesional y los tratamientos reales antes de publicar.
"""
from __future__ import annotations

import argparse
import getpass
import html
import os
import pathlib
import sys
from datetime import date

MAIL = "info@rutacap.es"

def h(value: str) -> str:
    return html.escape(value, quote=True)

def page(title: str, owner: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{h(title)} · RutaCAP</title>
<meta name="robots" content="index,follow">
<style>
:root{{color-scheme:dark}}*{{box-sizing:border-box}}
body{{margin:0;background:#101722;color:#e8eff6;font:16px/1.65 system-ui,sans-serif}}
main{{max-width:810px;margin:0 auto;padding:30px 20px 68px}}
h1,h2{{line-height:1.25}}h1{{font-size:2rem}}h2{{margin-top:2rem;font-size:1.3rem}}
a{{color:#94c9ff}}a:hover{{color:#d4edff}}
nav{{display:flex;flex-wrap:wrap;gap:12px 24px;border-bottom:1px solid #314152;padding-bottom:22px}}
small{{color:#b1becb}}p,li{{overflow-wrap:anywhere}}
</style></head><body><main>
<nav aria-label="Información legal"><a href="/">RutaCAP</a>
<a href="/legal/aviso-legal.html">Aviso legal</a>
<a href="/legal/privacidad.html">Privacidad</a>
<a href="/legal/condiciones-beta.html">Condiciones beta</a>
<a href="mailto:{MAIL}">{MAIL}</a></nav>
<h1>{h(title)}</h1><small>Última revisión: {date.today().strftime('%d/%m/%Y')}</small>
{body}
<footer><hr><small>RutaCAP · Herramienta independiente de preparación CAP, no oficial.
Titular: {owner} · <a href="mailto:{MAIL}">{MAIL}</a></small></footer>
</main></body></html>"""

def write_file(dest: pathlib.Path, content: str) -> None:
    tmp = dest.with_name(dest.name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as file:
        file.write(content)
    os.chmod(tmp, 0o644)
    os.replace(tmp, dest)

def main() -> int:
    ap = argparse.ArgumentParser(description="Crear las páginas legales privadas del VPS (sin desplegar ni activar web)")
    ap.add_argument("--out", default="/srv/rutacap/legal", help="Directorio de salida")
    ap.add_argument("--confirm-public-disclosure", action="store_true", help="Confirmo que DNI y domicilio aparecerán públicamente en el aviso legal")
    args = ap.parse_args()
    if not args.confirm_public_disclosure:
        print("No se ha hecho nada. Lea el aviso y añada --confirm-public-disclosure para continuar.", file=sys.stderr)
        return 2
    print("ATENCIÓN: los datos del aviso legal SERÁN visibles públicamente cuando se active la ruta.")
    print("No introduzca datos ficticios. Esta ejecución no publica la web ni modifica Caddy.")
    owner = input("Nombre y apellidos completos del responsable: ").strip()
    nif = getpass.getpass("NIF/DNI del titular (entrada oculta): ").strip()
    domicile = input("Domicilio a mostrar públicamente (dirección legal real): ").strip()
    if not all([owner, nif, domicile]):
        print("Falta un campo obligatorio. No se generaron archivos.", file=sys.stderr)
        return 2
    print("Confirme de forma consciente: nombre, NIF y domicilio estarán accesibles por Internet.")
    if input("Escriba PUBLICAR DATOS para continuar: ").strip() != "PUBLICAR DATOS":
        print("Cancelado sin guardar datos.")
        return 2
    O, N, D = h(owner), h(nif), h(domicile)
    target = pathlib.Path(args.out)
    target.mkdir(parents=True, exist_ok=True, mode=0o755)
    legal = page("Aviso legal", O, f"""
<h2>Identificación del titular</h2>
<p><strong>Titular y responsable:</strong> {O} (persona física).<br>
<strong>NIF:</strong> {N}.<br><strong>Domicilio:</strong> {D}.<br>
<strong>Contacto:</strong> <a href="mailto:{MAIL}">{MAIL}</a>.<br>
<strong>Sitio:</strong> https://rutacap.es.</p>
<h2>Actividad y situación de la beta</h2>
<p>RutaCAP es una herramienta independiente de preparación y práctica para exámenes CAP.
No forma parte de la Administración pública, no representa al organismo convocante
ni implica reconocimiento, patrocinio o validación oficial de sus materiales.</p>
<p>Esta versión beta se ofrece gratuitamente, sin suscripciones ni pagos habilitados.
Los contenidos históricos y las respuestas pueden contener errores, ser objeto de revisión
o diferir de la normativa vigente; deben contrastarse con las publicaciones oficiales.</p>
<h2>Propiedad intelectual y fuentes</h2>
<p>El diseño y los componentes originales de RutaCAP corresponden a sus respectivos titulares.
Las fuentes oficiales de cada contenido se identifican cuando constan. El hecho de citar una
fuente no implica que el organismo público respalde este servicio. Para consultas sobre
reutilización de contenidos, contacte con <a href="mailto:{MAIL}">{MAIL}</a>.</p>
<h2>Disponibilidad y responsabilidad</h2>
<p>La beta puede sufrir interrupciones o correcciones. Ningún resultado obtenido en RutaCAP
equivale a una calificación o certificación oficial. Estas condiciones no limitan los derechos
irrenunciables de usuarios y consumidores que resulten aplicables.</p>
""")
    privacy = page("Política de privacidad", O, f"""
<h2>Responsable del tratamiento</h2>
<p>{O}. Domicilio: {D}. Contacto y ejercicio de derechos:
<a href="mailto:{MAIL}">{MAIL}</a>.</p>
<h2>Qué datos se utilizan y para qué</h2>
<p><strong>Progreso de estudio:</strong> durante esta beta, las respuestas, sesiones,
preferencias y progreso se guardan localmente en el navegador del usuario mediante
almacenamiento local/IndexedDB. La beta no ofrece registro ni sincronización de cuentas.
El responsable no dispone de acceso remoto ordinario a ese progreso local.</p>
<p><strong>Acceso al sitio:</strong> el servidor y su infraestructura pueden tratar datos
técnicos de conexión (como IP, fecha, URL solicitada y errores) para proporcionar el servicio,
garantizar la seguridad y diagnosticar incidencias. No se ha activado analítica publicitaria
ni se comercializan datos de navegación.</p>
<p><strong>Consultas por correo:</strong> se tratarán la dirección del remitente y el
contenido que envíe voluntariamente a {MAIL} para atender su solicitud.</p>
<h2>Base jurídica y conservación</h2>
<p>La atención a consultas se basa en las medidas solicitadas por el interesado y/o
el interés legítimo de responder. Las operaciones técnicas necesarias para prestar y
proteger el servicio se basan en el interés legítimo correspondiente, respetando los derechos
de los usuarios. Las comunicaciones se conservarán mientras sean necesarias para su
gestión y, en su caso, las obligaciones legales aplicables. Los registros técnicos estarán
sujetos a la configuración de retención y rotación del servidor; verificar dicha configuración
antes del lanzamiento público. El progreso local permanece hasta que el usuario lo borre
o el navegador lo elimine.</p>
<h2>Destinatarios y transferencias</h2>
<p>OVHcloud proporciona la infraestructura de alojamiento, bajo las condiciones y ubicación
de servicio contratadas. No se han habilitado servicios externos de cuenta, pago ni anuncios
en esta beta. La existencia de transferencias internacionales y su régimen, si las hubiera,
debe comprobarse con la configuración efectiva de los proveedores antes de publicar.</p>
<h2>Derechos y reclamaciones</h2>
<p>Podrá solicitar acceso, rectificación, supresión, oposición, limitación y portabilidad
cuando correspondan, escribiendo a <a href="mailto:{MAIL}">{MAIL}</a>.
También puede presentar reclamación ante la
<a href="https://www.aepd.es/" rel="noopener noreferrer">Agencia Española de Protección de Datos</a>.
El progreso almacenado únicamente en el navegador puede consultarse o borrarse desde
la propia aplicación o las opciones del navegador.</p>
<h2>Almacenamiento y cookies</h2>
<p>La aplicación utiliza almacenamiento local y caché de servicio para permitir el estudio y
la persistencia del progreso. No se ha activado en esta beta una herramienta propia de
publicidad comportamental. La configuración definitiva de cookies y almacenamiento
se revisará antes de la apertura pública; si se incorporan tecnologías no esenciales,
se informará y solicitará el consentimiento cuando sea exigible.</p>
""")
    terms = page("Condiciones de la beta gratuita", O, f"""
<h2>Acceso y alcance</h2>
<p>RutaCAP se facilita de forma gratuita, experimental e independiente para practicar
preguntas CAP. En esta etapa no hay cuentas remotas, suscripciones ni compras.</p>
<h2>Progreso y copias</h2>
<p>El avance se almacena en el navegador concreto donde se utiliza. Al borrar los datos
del navegador, utilizar modo incógnito o cambiar de dispositivo, el progreso puede perderse.
Se recomienda exportar una copia desde las opciones disponibles de la aplicación.</p>
<h2>Carácter orientativo</h2>
<p>La selección de preguntas, las respuestas, los simulacros y sus calificaciones sirven para
estudiar. No sustituyen documentos, convocatorias, plantillas ni resoluciones oficiales.
Pueden existir preguntas pendientes de revisión editorial o cambios normativos posteriores.</p>
<h2>Uso y contacto</h2>
<p>El usuario debe utilizar el servicio de forma lícita, sin intentar acceder a sistemas
no habilitados. Para informar de errores o solicitar aclaraciones escriba a
<a href="mailto:{MAIL}">{MAIL}</a>. Las funcionalidades pueden cambiar durante la beta,
respetando siempre los derechos que correspondan por ley.</p>
""")
    for filename, content in [
        ("aviso-legal.html", legal),
        ("privacidad.html", privacy),
        ("condiciones-beta.html", terms),
    ]:
        write_file(target / filename, content)
    print(f"Generadas 3 páginas en {target}; ninguna publicada ni subida a GitHub.")
    print("PENDIENTE: revisar conservación de logs, encargados/proveedores,")
    print("fuentes/licencias del contenido y correo info@rutacap.es antes de publicar.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
