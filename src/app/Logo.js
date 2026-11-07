/**
 * Bingemix mark: a miniature program grid, rows of different-width blocks with
 * one bright block as the "now" slot. Colours follow the theme's accent.
 */
export default function Logo({ className = '', title }) {
    return (
        <svg
            viewBox="0 0 64 64"
            className={className}
            role={title ? 'img' : undefined}
            aria-label={title}
            aria-hidden={title ? undefined : true}
        >
            <rect width="64" height="64" rx="14" style={{ fill: 'var(--accent)' }} />
            <g style={{ fill: 'var(--accent-fg)' }}>
                <rect x="12" y="15" width="16" height="9" rx="2.5" opacity=".5" />
                <rect x="31" y="15" width="21" height="9" rx="2.5" opacity=".5" />
                <rect x="12" y="28" width="24" height="9" rx="2.5" />
                <rect x="39" y="28" width="13" height="9" rx="2.5" opacity=".5" />
                <rect x="12" y="41" width="11" height="9" rx="2.5" opacity=".5" />
                <rect x="26" y="41" width="26" height="9" rx="2.5" opacity=".5" />
            </g>
        </svg>
    );
}
