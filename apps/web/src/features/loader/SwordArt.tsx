/**
 * Animated bonfire sword: the blade, flames and crossguard glow in a loop.
 * Art only; `AppLoader` wraps it in the kit's `Loader`, which adds the status role and the label.
 */
export function SwordArt() {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="sword-loader-svg"
      aria-hidden="true"
    >
      <style>{`
            .sword-loader-svg {
              width: 100%;
              height: 100%;
              overflow: visible;
              animation: swordContainerGlow 2.4s ease-in-out infinite;
            }
            .sword-loader-fire {
              fill: #FF7A3D;
              transform-origin: 32px 46px;
              animation: swordFirePulse 2.4s ease-in-out infinite;
            }
            .sword-loader-core {
              fill: #FFC857;
              transform-origin: 32px 46px;
              animation: swordCoreFlicker 2.4s ease-in-out infinite;
            }
            .sword-loader-blade {
              fill: #E9E5F5;
              animation: swordBladeGlow 2.4s ease-in-out infinite;
            }
            .sword-loader-blade-shade {
              fill: #B9B0D6;
              animation: swordBladeGlow 2.4s ease-in-out infinite;
            }
            .sword-loader-guard,
            .sword-loader-pommel {
              fill: #F2B84B;
              animation: swordGoldGlow 2.4s ease-in-out infinite;
            }
            .sword-loader-grip {
              fill: #C98A2B;
            }
            .sword-loader-ash {
              fill: #5B3F8C;
              animation: swordAshPulse 2.4s ease-in-out infinite;
            }
            @keyframes swordFirePulse {
              0%, 100% {
                opacity: 0.35;
                filter: saturate(0.3) brightness(0.7);
                transform: scale(0.92);
              }
              50% {
                opacity: 1;
                filter: saturate(1.35) brightness(1.15) drop-shadow(0 0 8px #FF7A3D);
                transform: scale(1.06);
              }
            }
            @keyframes swordCoreFlicker {
              0%, 100% {
                opacity: 0.25;
                filter: saturate(0.3);
                transform: scale(0.85);
              }
              50% {
                opacity: 1;
                filter: saturate(1.4) brightness(1.2) drop-shadow(0 0 6px #FFC857);
                transform: scale(1.1);
              }
            }
            @keyframes swordBladeGlow {
              0%, 100% {
                opacity: 0.55;
                filter: brightness(0.75);
              }
              50% {
                opacity: 1;
                filter: brightness(1.25) drop-shadow(0 0 6px rgba(233, 229, 245, 0.9));
              }
            }
            @keyframes swordGoldGlow {
              0%, 100% {
                opacity: 0.6;
                filter: saturate(0.4) brightness(0.75);
              }
              50% {
                opacity: 1;
                filter: saturate(1.3) brightness(1.2) drop-shadow(0 0 5px #F2B84B);
              }
            }
            @keyframes swordAshPulse {
              0%, 100% {
                opacity: 0.45;
              }
              50% {
                opacity: 0.9;
                filter: drop-shadow(0 0 4px #5B3F8C);
              }
            }
            @keyframes swordContainerGlow {
              0%, 100% {
                filter: drop-shadow(0 3px 8px rgba(26, 16, 48, 0.25));
              }
              50% {
                filter: drop-shadow(0 4px 16px rgba(255, 122, 61, 0.4)) drop-shadow(0 0 8px rgba(255, 200, 87, 0.3));
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .sword-loader-svg,
              .sword-loader-fire,
              .sword-loader-core,
              .sword-loader-blade,
              .sword-loader-blade-shade,
              .sword-loader-guard,
              .sword-loader-pommel,
              .sword-loader-ash {
                animation: none !important;
                opacity: 1 !important;
                filter: none !important;
                transform: none !important;
              }
            }
          `}</style>
      {/* Rounded tile background */}
      <rect width="64" height="64" rx="14" fill="#1A1030" />
      {/* Ash base */}
      <path className="sword-loader-ash" d="M10 57c5-5 13-7 22-7s17 2 22 7z" />
      {/* Outer fire flame */}
      <path
        className="sword-loader-fire"
        d="M32 24c6 7 17 11 17 22 0 6-7 9-17 9s-17-3-17-9c0-7 4-10 7-16 1 5 3 7 6 8 0-6 1-10 4-14z"
      />
      {/* Inner core flame */}
      <path
        className="sword-loader-core"
        d="M32 36c3.5 4.5 9 7 9 12.5 0 4.5-4.5 6.5-9 6.5s-9-2-9-6.5c0-5.5 5.5-8 9-12.5z"
      />
      {/* Sword blade */}
      <path className="sword-loader-blade" d="M27.5 20h9v28l-4.5 6.5-4.5-6.5z" />
      <path className="sword-loader-blade-shade" d="M32 20h4.5v28L32 54.5z" />
      {/* Sword crossguard */}
      <rect className="sword-loader-guard" x="16" y="16" width="32" height="6.5" rx="3.2" />
      {/* Sword grip */}
      <rect className="sword-loader-grip" x="29" y="9" width="6" height="8" />
      {/* Sword pommel */}
      <circle className="sword-loader-pommel" cx="32" cy="8" r="4.5" />
    </svg>
  );
}
