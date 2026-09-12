import ReactMarkdown from 'react-markdown';

export function MessageBubble({ m }) {
  if (m.role === 'error') {
    return (
      <div data-testid="assist-error" className="mx-3 my-1.5 px-2.5 py-2 rounded text-[11px] font-mono" style={{ background: 'rgba(239,68,68,0.10)', color: 'var(--destructive)', border: '1px solid rgba(239,68,68,0.3)' }}>
        {m.content}
      </div>
    );
  }
  const user = m.role === 'user';
  return (
    <div data-testid={user ? 'assist-user-msg' : 'assist-assistant-msg'} className={'mx-3 my-1.5 flex ' + (user ? 'justify-end' : 'justify-start')}>
      <div
        className="max-w-[92%] px-3 py-2 rounded-md text-[12px] leading-relaxed assist-md"
        style={user
          ? { background: 'rgba(234,88,12,0.14)', border: '1px solid rgba(234,88,12,0.35)', color: 'var(--text-hi, #e5e7eb)' }
          : { background: 'var(--panel-bg-raised)', border: '1px solid var(--panel-border-subtle)', color: 'var(--text-hi, #e5e7eb)' }}
      >
        {user ? <span className="whitespace-pre-wrap">{m.content}</span> : <ReactMarkdown>{m.content || '…'}</ReactMarkdown>}
      </div>
    </div>
  );
}
