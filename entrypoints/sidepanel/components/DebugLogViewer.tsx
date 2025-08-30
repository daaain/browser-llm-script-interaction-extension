import type React from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import {
  backgroundLogger,
  contentLogger,
  type LogEntry,
  type LogQueryOptions,
  optionsLogger,
  sidepanelLogger,
} from '~/utils/debug-logger';

interface DebugLogViewerProps {
  isVisible: boolean;
  onClose: () => void;
}

interface LogFilter {
  levels: LogEntry['level'][];
  contexts: LogEntry['context'][];
  limit: number;
  since?: number;
}

const DebugLogViewer: React.FC<DebugLogViewerProps> = ({ isVisible, onClose }) => {
  const selectId = useId();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<LogFilter>({
    levels: ['debug', 'info', 'warn', 'error'],
    contexts: ['background', 'sidepanel', 'content', 'options'],
    limit: 200,
  });
  const [stats, setStats] = useState<{
    total: number;
    byLevel: Record<LogEntry['level'], number>;
    byContext: Record<LogEntry['context'], number>;
  } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadLogs = useCallback(async () => {
    if (!isVisible) return;

    setLoading(true);
    try {
      const queryOptions: LogQueryOptions = {
        level: filter.levels,
        context: filter.contexts,
        limit: filter.limit,
        since: filter.since,
      };

      // Use any logger instance since they all share the same storage now
      const allLogs = await backgroundLogger.queryLogs(queryOptions);
      setLogs(allLogs);

      // Get stats from the shared storage
      const stats = await backgroundLogger.getLogStats();
      setStats(stats);
    } catch (error) {
      sidepanelLogger.error('Failed to load debug logs', error);
    } finally {
      setLoading(false);
    }
  }, [isVisible, filter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Auto-refresh logs every 2 seconds if enabled
  useEffect(() => {
    if (!autoRefresh || !isVisible) return;

    const interval = setInterval(loadLogs, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh, isVisible, loadLogs]);

  const handleLevelToggle = (level: LogEntry['level']) => {
    setFilter((prev) => ({
      ...prev,
      levels: prev.levels.includes(level)
        ? prev.levels.filter((l) => l !== level)
        : [...prev.levels, level],
    }));
  };

  const handleContextToggle = (context: LogEntry['context']) => {
    setFilter((prev) => ({
      ...prev,
      contexts: prev.contexts.includes(context)
        ? prev.contexts.filter((c) => c !== context)
        : [...prev.contexts, context],
    }));
  };

  const clearAllLogs = async () => {
    try {
      await Promise.all([
        sidepanelLogger.clearLogs(),
        backgroundLogger.clearLogs(),
        contentLogger.clearLogs(),
        optionsLogger.clearLogs(),
      ]);
      setLogs([]);
      setStats(null);
      sidepanelLogger.info('Debug logs cleared by user');
    } catch (error) {
      sidepanelLogger.error('Failed to clear debug logs', error);
    }
  };

  const exportLogs = () => {
    const exportData = JSON.stringify(logs, null, 2);
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-logs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'debug':
        return '#6b7280';
      case 'info':
        return '#3b82f6';
      case 'warn':
        return '#f59e0b';
      case 'error':
        return '#ef4444';
    }
  };

  const getContextColor = (context: LogEntry['context']) => {
    switch (context) {
      case 'background':
        return '#8b5cf6';
      case 'sidepanel':
        return '#06b6d4';
      case 'content':
        return '#10b981';
      case 'options':
        return '#f97316';
    }
  };

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        zIndex: 9999,
        padding: '20px',
        color: 'white',
        fontFamily: 'monospace',
        fontSize: '12px',
      }}
    >
      <div
        style={{
          backgroundColor: '#1f2937',
          borderRadius: '8px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid #374151',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ margin: 0, color: '#f3f4f6' }}>Debug Logs</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {stats && (
              <span style={{ color: '#9ca3af', fontSize: '11px' }}>
                Total: {stats.total} | Errors: {stats.byLevel.error} | Warns: {stats.byLevel.warn}
              </span>
            )}
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{
                background: autoRefresh ? '#10b981' : '#374151',
                color: 'white',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={loadLogs}
              disabled={loading}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={exportLogs}
              style={{
                background: '#6b7280',
                color: 'white',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Export
            </button>
            <button
              type="button"
              onClick={clearAllLogs}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#374151',
                color: 'white',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Filters */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #374151',
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <span style={{ color: '#d1d5db', marginRight: '8px', fontSize: '11px' }}>Levels:</span>
            {(['debug', 'info', 'warn', 'error'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => handleLevelToggle(level)}
                style={{
                  background: filter.levels.includes(level) ? getLevelColor(level) : '#374151',
                  color: 'white',
                  border: 'none',
                  padding: '2px 6px',
                  margin: '0 2px',
                  borderRadius: '3px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {level}
              </button>
            ))}
          </div>

          <div>
            <span style={{ color: '#d1d5db', marginRight: '8px', fontSize: '11px' }}>
              Contexts:
            </span>
            {(['background', 'sidepanel', 'content', 'options'] as const).map((context) => (
              <button
                key={context}
                type="button"
                onClick={() => handleContextToggle(context)}
                style={{
                  background: filter.contexts.includes(context)
                    ? getContextColor(context)
                    : '#374151',
                  color: 'white',
                  border: 'none',
                  padding: '2px 6px',
                  margin: '0 2px',
                  borderRadius: '3px',
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                {context}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor={selectId}
              style={{ color: '#d1d5db', marginRight: '8px', fontSize: '11px' }}
            >
              Limit:
            </label>
            <select
              id={selectId}
              value={filter.limit}
              onChange={(e) => setFilter((prev) => ({ ...prev, limit: Number(e.target.value) }))}
              style={{
                background: '#374151',
                color: 'white',
                border: '1px solid #6b7280',
                borderRadius: '3px',
                fontSize: '11px',
                padding: '2px 4px',
              }}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </div>
        </div>

        {/* Log entries */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '8px',
          }}
        >
          {loading && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
              Loading logs...
            </div>
          )}

          {!loading && logs.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
              No logs found. Try adjusting your filters or check if debug mode is enabled.
            </div>
          )}

          {logs.map((log) => (
            <div
              key={log.id}
              style={{
                padding: '4px 8px',
                marginBottom: '2px',
                borderLeft: `3px solid ${getLevelColor(log.level)}`,
                backgroundColor:
                  log.level === 'error' ? '#fee2e2' : log.level === 'warn' ? '#fef3c7' : '#f9fafb',
                color:
                  log.level === 'error' ? '#991b1b' : log.level === 'warn' ? '#92400e' : '#111827',
                borderRadius: '2px',
                wordBreak: 'break-word',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '2px',
                  fontSize: '10px',
                  color: '#6b7280',
                }}
              >
                <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span
                  style={{
                    background: getLevelColor(log.level),
                    color: 'white',
                    padding: '1px 4px',
                    borderRadius: '2px',
                    textTransform: 'uppercase',
                    fontWeight: 'bold',
                  }}
                >
                  {log.level}
                </span>
                <span
                  style={{
                    background: getContextColor(log.context),
                    color: 'white',
                    padding: '1px 4px',
                    borderRadius: '2px',
                    textTransform: 'uppercase',
                  }}
                >
                  {log.context}
                </span>
              </div>
              <div style={{ fontSize: '11px', lineHeight: '1.4' }}>{log.message}</div>
              {log.data && (
                <details style={{ marginTop: '4px' }}>
                  <summary
                    style={{
                      cursor: 'pointer',
                      fontSize: '10px',
                      color: '#6b7280',
                      userSelect: 'none',
                    }}
                  >
                    Data
                  </summary>
                  <pre
                    style={{
                      marginTop: '4px',
                      padding: '4px',
                      background: '#f3f4f6',
                      borderRadius: '2px',
                      fontSize: '10px',
                      overflow: 'auto',
                      maxHeight: '200px',
                      color: '#111827',
                    }}
                  >
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid #374151',
            fontSize: '10px',
            color: '#9ca3af',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            Showing {logs.length} logs
            {filter.since && ` since ${new Date(filter.since).toLocaleString()}`}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setFilter((prev) => ({ ...prev, since: Date.now() - 60 * 60 * 1000 }))}
              style={{
                background: 'none',
                color: '#9ca3af',
                border: '1px solid #6b7280',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '10px',
                cursor: 'pointer',
              }}
            >
              Last Hour
            </button>
            <button
              type="button"
              onClick={() => setFilter((prev) => ({ ...prev, since: Date.now() - 10 * 60 * 1000 }))}
              style={{
                background: 'none',
                color: '#9ca3af',
                border: '1px solid #6b7280',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '10px',
                cursor: 'pointer',
              }}
            >
              Last 10min
            </button>
            <button
              type="button"
              onClick={() => setFilter((prev) => ({ ...prev, since: undefined }))}
              style={{
                background: 'none',
                color: '#9ca3af',
                border: '1px solid #6b7280',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '10px',
                cursor: 'pointer',
              }}
            >
              All Time
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugLogViewer;
