# Panel de Limpieza · Colectivos

App web responsive para gestionar órdenes de servicio de limpieza de
colectivos, usando Google Sheets como base de datos a través de una
API hecha con Google Apps Script.

## Archivos

- `index.html` — Estructura de las dos pantallas y el modal.
- `style.css` — Estilos (tema oscuro, tarjetas, colores por estado).
- `app.js` — Lógica de la app y llamadas a la API.
- `appscript.gs` — Backend / API REST sobre Google Sheets.

## 1. Preparar la hoja de Google Sheets

Crear una hoja de cálculo con una pestaña llamada **Ordenes** y estos
encabezados exactos en la primera fila (en cualquier orden):

```
Orden | Ficha | Descripcion | Taller | Legajo | FechaInicial | FechaFinal | HoraSalida | TiempoFinal | Estado | Comentario | Sintoma | Causa
```

Cargar las órdenes existentes con `Estado = Creado` para las que aún
no se empezaron a trabajar.

## 2. Publicar el backend (Apps Script)

1. En la hoja: **Extensiones > Apps Script**.
2. Borrar el contenido por defecto y pegar todo `appscript.gs`.
3. Si tu pestaña tiene otro nombre, cambiar la constante
   `SHEET_NAME` al principio del archivo.
4. **Implementar > Nueva implementación**.
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario**.
5. Autorizar los permisos solicitados.
6. Copiar la URL que termina en `/exec`.

## 3. Conectar el frontend

En `app.js`, reemplazar:

```js
const API_URL = 'https://script.google.com/macros/s/TU_ID_DE_DESPLIEGUE/exec';
```

por la URL copiada en el paso anterior.

## 4. Publicar el frontend

Subir `index.html`, `style.css` y `app.js` a cualquier hosting
estático (GitHub Pages, Netlify, Vercel, Google Sites con HTML
embebido, etc.) o abrir `index.html` directamente en el navegador del
celular para probar.

> Nota: cada vez que se modifique `appscript.gs` hay que crear una
> **nueva implementación** (o "Gestionar implementaciones > Editar >
> Nueva versión") para que los cambios queden activos en la URL
> publicada.

## Flujo de uso

1. El operario ingresa su **legajo** y toca **Buscar Órdenes**.
2. Ve sus órdenes en estado *Creado* o *En proceso* como tarjetas.
3. En una orden **Creado**, toca **Iniciar Trabajo**: se guarda la
   hora de salida, se completa la fecha inicial si falta, y el estado
   pasa a **En proceso**.
4. En una orden **En proceso**, toca **Finalizar Trabajo**: se abre un
   modal obligatorio (Síntoma, Causa, Comentario). Al confirmar, se
   registra fecha y hora final y el estado pasa a **Finalizado**.

## Detalles técnicos

- La API se expone bajo una única URL de Apps Script; las "rutas" se
  resuelven con el parámetro `action` (`?action=ordenes` por GET,
  `{"action":"iniciar"}` / `{"action":"finalizar"}` por POST), ya que
  Apps Script no soporta rutas tipo `/ordenes` reales.
- Los POST se envían con `Content-Type: text/plain` para evitar el
  preflight CORS que Apps Script no responde correctamente con
  `application/json`; el backend igual interpreta el cuerpo como JSON.
- Los botones se deshabilitan mientras hay una petición en curso para
  evitar dobles clics, y se muestra un spinner de carga durante las
  búsquedas.
- Los errores de red o de validación se muestran con un mensaje
  (toast) en pantalla.
