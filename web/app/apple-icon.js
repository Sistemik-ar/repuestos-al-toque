import { ImageResponse } from 'next/og';

// Ícono para iOS (home screen). DEBE ser opaco y a sangre completa: iOS le redondea las
// esquinas solo. Generado por código para evitar PNGs con transparencia (que iOS pinta blancos).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg,#6D28D9,#8B5CF6)',
        }}
      >
        <svg width="112" height="112" viewBox="0 0 24 24" fill="#FACC15">
          <path d="M13 2 4 14h6l-1 8 9-13h-7z" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
