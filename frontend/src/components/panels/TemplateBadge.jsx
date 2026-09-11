import { sourceInfo } from '../../lib/quinnTemplate';
import { ShieldAlert, ShieldCheck, FileQuestion } from 'lucide-react';

export function toneColor(tone) {
  if (tone === 'ok') return 'var(--dcc-emerald)';
  if (tone === 'warn') return 'var(--dcc-gold)';
  return 'var(--destructive)';
}

export default function TemplateBadge({ source, compact = false }) {
  const info = sourceInfo(source);
  const color = toneColor(info.tone);
  const Icon = source === 'user_authoritative' ? ShieldCheck : source === 'sample_dev' ? ShieldAlert : FileQuestion;
  return (
    <div
      data-testid="template-source-badge"
      data-source={source}
      className={`rounded flex items-start gap-2 ${compact ? 'px-2 py-1' : 'px-2.5 py-2'}`}
      style={{ background: 'var(--panel-bg-raised)', border: `1px solid ${color}` }}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color }} />
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-wider leading-tight" style={{ color }}>
          {compact ? info.short : info.badge}
        </div>
        {!compact && (
          <div className="text-[10px] leading-snug mt-0.5" style={{ color: 'var(--text-mid)' }}>{info.note}</div>
        )}
      </div>
    </div>
  );
}

export function ValidationPill({ validation }) {
  if (!validation) {
    return <span className="font-mono text-[9px] px-1.5 py-0.5 rounded uppercase" data-testid="template-validation-pill"
      style={{ background: 'var(--panel-bg-raised)', color: 'var(--text-faint)', border: '1px solid var(--text-faint)' }}>NOT RUN</span>;
  }
  const map = { valid: ['VALID', 'var(--dcc-emerald)'], warning: ['VALID · WARNINGS', 'var(--dcc-gold)'], invalid: ['INVALID', 'var(--destructive)'] };
  const [label, color] = map[validation.status] || ['—', 'var(--text-faint)'];
  return <span className="font-mono text-[9px] px-1.5 py-0.5 rounded uppercase" data-testid="template-validation-pill" data-status={validation.status}
    style={{ background: 'var(--panel-bg-raised)', color, border: `1px solid ${color}` }}>{label}</span>;
}
