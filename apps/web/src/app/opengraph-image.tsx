import { ImageResponse } from 'next/og';
import { site } from '@/site.config';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${site.name} — ${site.tagline}`;

/** Generated at build time so pasting the link anywhere yields a real card. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: '#17120E',
          padding: 80,
        }}
      >
        <div style={{ fontSize: 30, color: '#C8A24C', letterSpacing: 2 }}>AUTMN</div>
        <div style={{ fontSize: 68, color: '#F5EFE6', marginTop: 24, lineHeight: 1.15 }}>
          {site.tagline}
        </div>
        <div style={{ fontSize: 30, color: '#B8AA98', marginTop: 32 }}>
          WhatsApp-native AI product photography for Indian micro-sellers
        </div>
      </div>
    ),
    size,
  );
}
