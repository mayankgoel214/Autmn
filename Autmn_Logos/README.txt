AUTMN — LOGO KIT
================

The mark is an "aperture-bloom": a flower that doubles as a camera shutter —
6 spun blades with a peek-through pinhole. It works as the app icon, the
WhatsApp avatar, the favicon, and the corner watermark on every generated image.

Brand colours
-------------
Gold   #C99A3F   (petals / the "Au" in the wordmark)
Ink    #17120E   (dark base / text on light)
Cream  #F7F2E9   (light base / text on dark)
White  #FFFFFF   (watermark on photos)

Wordmark
--------
"Autmn" — the "Au" is always GOLD, the rest is ink (on light) or cream (on dark).
The wordmark is OUTLINED to vector paths, so no font install is needed anywhere.
Typeface of record: Fraunces (semibold).

Folder structure
----------------
svg/   — scalable vector source (use these in Figma, Illustrator, web, print)
png/   — raster exports at multiple sizes (transparent background)

svg/icon, png/icon
  mark-gold / mark-white / mark-ink / mark-cream  — bloom only, transparent bg, transparent pinhole
  icon-gold-on-ink / icon-cream-on-ink / icon-ink-on-gold / icon-ink-on-cream — bloom in a rounded tile (app icon)
  favicon  — rounded gold-on-ink tile (png at 16/32/48)
  avatar   — full-bleed square gold-on-ink (png at 512/1024) -> upload to WhatsApp Business

svg/wordmark, png/wordmark
  wordmark-onlight  — Au gold + tmn ink   (use on light backgrounds)
  wordmark-ondark   — Au gold + tmn cream (use on dark backgrounds)

svg/lockup, png/lockup
  lockup-onlight / lockup-ondark            — icon + wordmark, horizontal, transparent bg
  lockup-ink-tile / lockup-cream-tile       — icon + wordmark on a rounded tile (social headers)
  lockup-stacked-onlight / -ondark          — icon above wordmark

svg/watermark, png/watermark
  watermark-white  — white bloom, transparent pinhole, for stamping on generated images

How to use the watermark (Gemini-style finish)
----------------------------------------------
Place watermark-white bottom-right, ~7-8% of the image width, at ~32% opacity.
The transparent pinhole lets the photo show through, which gives the embossed,
premium feel. Use white on most photos; the slight transparency keeps it legible
on both light and dark images.

WhatsApp Business profile
-------------------------
Avatar:  png/avatar/avatar-512.png
Name:    Autmn
About:   Professional product photos on WhatsApp. Send a photo, get a brand-ready
         ad in minutes. First one free.
