# AGENTS.md — ParkFlow UI & Design System (Solo Estilos)

> **Alcance de este agente:** Reglas estrictas de diseño visual, tokens CSS, geometría de componentes, iconografía y temas (Light/Dark) para **ParkFlow (TecNM Campus Morelia)**.  
> **Límite:** No modifiques lógica de negocio, contratos de API, rutas ni estados de datos salvo que el cambio de layout requiera reorganizar cómo se muestran.

---

## 1. Identidad y Tokens de Color

El color ancla institucional es el **Azul TecNM (Pantone 294 C — `#1B396A`)**.  
En **Dark Mode**, `#1B396A` se reserva para encabezados, botones sólidos con texto blanco y fondos de acento; para texto, bordes activos, cursivas destacadas y anillos de progreso se debe usar `#6BA0FF` / `#4B83F2` para garantizar contraste legible.

```css
:root {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

  /* Brand (TecNM Pantone 294 C) */
  --tecnm-blue: #1B396A;
  --tecnm-blue-deep: #132A4F;
  --tecnm-blue-mid: #254E8F;
  --tecnm-accent-bright: #4B83F2;

  /* Surfaces & Text — Light Mode */
  --bg-app: #F4F6FA;
  --bg-surface: #FFFFFF;
  --bg-surface-elevated: #FFFFFF;
  --bg-subtle: #EEF2F7;
  --bg-nav: rgba(15, 20, 30, 0.92);
  --text-primary: #0B1220;
  --text-secondary: #5A657A;
  --text-muted: #8894A8;
  --border-subtle: rgba(15, 23, 42, 0.08);
  --border-bay: rgba(15, 23, 42, 0.14);
  --accent-text: #1B396A;
  --accent-soft: rgba(27, 57, 106, 0.10);
  --accent-soft-strong: rgba(27, 57, 106, 0.16);
  --shadow-float: 0 14px 34px rgba(15, 23, 42, 0.10);
  --shadow-card: 0 4px 16px rgba(15, 23, 42, 0.05);

  /* Semantic Status */
  --free: #16A34A;
  --free-soft: rgba(22, 163, 74, 0.14);
  --maneuver: #F59E0B;
  --maneuver-soft: rgba(245, 158, 11, 0.14);
  --occupied: #EF4444;
  --occupied-soft: rgba(239, 68, 68, 0.14);
  --car-body: #94A3B8;
  --car-glass: #334155;
  --lane-bg: #EAEFF6;
  --lane-dash: rgba(27, 57, 106, 0.28);
}

[data-theme="dark"] {
  --bg-app: #0E1117;
  --bg-surface: #171B24;
  --bg-surface-elevated: #1E2430;
  --bg-subtle: #1C212C;
  --bg-nav: rgba(26, 31, 42, 0.88);
  --text-primary: #F8FAFC;
  --text-secondary: #9CA6B8;
  --text-muted: #6C778B;
  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-bay: rgba(255, 255, 255, 0.13);
  --accent-text: #6BA0FF;
  --accent-soft: rgba(75, 131, 242, 0.16);
  --accent-soft-strong: rgba(75, 131, 242, 0.26);
  --shadow-float: 0 16px 36px rgba(0, 0, 0, 0.45);
  --shadow-card: none;

  --free: #22C55E;
  --maneuver: #F59E0B;
  --occupied: #F87171;
  --car-body: #64748B;
  --car-glass: #1E293B;
  --lane-bg: #12161F;
  --lane-dash: rgba(255, 255, 255, 0.16);
}
```

---

## 2. Reglas Prohibidas (Anti-Dashboard)

Para evitar que la app se vea como un panel administrativo genérico, **NUNCA** hagas lo siguiente:

1. **Sin rayas laterales ni bordes neón:** Prohibido usar `border-left: 4px solid ...`, bordes inferiores de color en tarjetas KPI o degradados verdes/naranjas dentro de tarjetas de zona.
2. **Sin emojis nativos en la UI:** Prohibido mezclar emojis (`🚗`, `🔒`, `🪪`, `★`) con iconos vectoriales. Usa exclusivamente SVG vectoriales consistentes (Lucide o Phosphor, trazo `1.75px–2.2px`).
3. **Sin tarjetas redundantes apiladas:** No separes "Mejor opción ahora" y "Reservar 15 min" en dos tarjetas distintas, ni uses una cuadrícula 2×2 para seleccionar campus.
4. **Sin controles de prueba en el flujo principal:** Nunca renderices cajas punteadas de `Modo Demo` o botones `Simular alerta RF-04` en medio de la pantalla Home. Deben vivir dentro de un **bottom sheet** disparado desde el pill `• Demo` del header.
5. **Sin texto repetitivo en el croquis:** No escribas `✓ LIBRE` ni `✕ OCUPADO` dentro de cada cajón del mapa; el estado debe leerse por geometría, auto cenital SVG y color.

---

## 3. Tipografía, Radios y Elevación

- **Familia:** `Inter` (`400`, `500`, `600`, `700`, `800` + `italic 600/700`).
- **Números:** Usa `font-variant-numeric: tabular-nums` en todos los contadores de cajones, porcentajes y temporizadores.
- **Énfasis de titulares:** Combina texto recto en bold con la palabra clave en *cursiva* y color de acento (`Encuentra tu <em>lugar</em>`).
- **Escala estricta de `border-radius`:**
  - `9999px`: Botones CTA, chips de campus/zona, badges de estado y barra de navegación inferior.
  - `20px–28px`: Encabezado curvo (`28px`), tarjetas principales (`20px–22px`), tablero del croquis (`24px`) y bottom sheets (`28px` superior).
  - `10px–12px`: Inputs, cajones del croquis y controles internos.
- **Elevación:**
  - En **Light Mode**, usa sombras suaves y difusas (`--shadow-float`, `--shadow-card`).
  - En **Dark Mode**, elimina sombras de tarjetas estándar (`--shadow-card: none`) y construye la jerarquía únicamente por diferencia tonal (`#0E1117` → `#171B24` → `#1E2430`) y bordes de `1px` en `rgba(255,255,255,0.07)`.

---

## 4. Patrones de Componentes Firma (ParkFlow)

1. **Header curvo + Hero superpuesto:** Encabezado en gradiente `#1B396A → #132A4F` con `border-bottom-left/right-radius: 28px`, barra horizontal deslizable de píldoras para campus y tarjeta de ocupación montada encima con margen superior negativo (`-38px`).
2. **Hero de Ocupación Espacial:** Un solo número protagonista de lugares libres + sub-métrica de maniobra/total + **anillo radial de ocupación (%)** a la derecha + **barra segmentada horizontal** (verde libre / ámbar maniobra / gris ocupado).
3. **Tarjeta Protagonista Unificada (Smart Action):** Una sola tarjeta en gradiente azul TecNM con sutil brillo superior (`1px` gradient) que muestra la mejor zona actual y el botón píldora blanco `Solicitar espacio y guiar (15 min)`.
4. **Tarjetas de Zona con Mini-Matriz de Cajones:** Superficies limpias (`--bg-surface`) sin bordes de colores. Cada tarjeta incluye al pie una fila de pequeños bloques (`height: 10px; border-radius: 3px`) que representan visualmente los cajones libres, en maniobra y ocupados de esa zona.
5. **Croquis con Cajones Abiertos al Carril:**
   - Bloques `A` y `B` con borde de `1.5px solid var(--border-bay)` **abiertos hacia el pasillo central** (`border-right: none` en Bloque A; `border-left: none` en Bloque B).
   - **Ocupado:** SVG cenital de auto + código discreto en una esquina.
   - **Maniobra:** Borde punteado ámbar (`dashed`) + punto ámbar + `Maniobra`.
   - **Libre:** Solo el código centrado en bold (`O-04`).
   - **Seleccionado / Reservado:** Borde sólido de `2px` en `--accent-text`, fondo `--accent-soft-strong`, animación secuencial en los chevrons del pasillo central hasta la fila del cajón y barra flotante contextual sobre la navbar (`Reservar (15 min)`).
6. **Leyenda del Croquis:** Solo punto de color (`6px`) + etiqueta (`Libre`, `Maniobra`, `Ocupado`), sin símbolos duplicados.
7. **Navbar Flotante tipo Píldora:** Contenedor despegado del borde inferior (`bottom: 16px; border-radius: 9999px; backdrop-filter: blur(18px)`), con el ícono activo dentro de un círculo sólido en `--tecnm-accent-bright`.

---

## 5. Checklist de Verificación Visual Antes de Entregar

- [ ] Se probó tanto en `data-theme="dark"` como en `data-theme="light"` sin pérdida de contraste.
- [ ] Cero emojis nativos en botones, badges o navegación.
- [ ] Cero `border-left` de colores o degradados neón en tarjetas de zona.
- [ ] Los controles de demo/simulación (`RF-04`, cambio de rol) están dentro del bottom sheet del pill `Demo`.
- [ ] La vista móvil (`375px–420px`) no tiene scroll horizontal ni elementos cortados por la navbar flotante.
