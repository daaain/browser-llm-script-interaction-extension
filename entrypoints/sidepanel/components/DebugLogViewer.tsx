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
  searchText?: string;
}

const DebugLogViewer: React.FC<DebugLogViewerProps> = ({ isVisible, onClose }) => {
  const selectId = useId();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<LogFilter>({
    levels: ['debug', 'info', 'warn', 'error'],
    contexts: ['background', 'sidepanel', 'content', 'options'],
    limit: 200,
    searchText: '',
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
        limit: filter.limit * 2, // Fetch more logs for text filtering
        since: filter.since,
      };

      // Use any logger instance since they all share the same storage now
      let allLogs = await backgroundLogger.queryLogs(queryOptions);

      // Apply text filtering if search text is provided
      if (filter.searchText?.trim()) {
        const searchTerm = filter.searchText.toLowerCase().trim();
        allLogs = allLogs.filter(
          (log) =>
            log.message.toLowerCase().includes(searchTerm) ||
            (log.data && JSON.stringify(log.data).toLowerCase().includes(searchTerm)),
        );
      }

      // Limit the results after text filtering
      if (allLogs.length > filter.limit) {
        allLogs = allLogs.slice(0, filter.limit);
      }

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

  if (!isVisible) return null;

  return (
    <div className="debug-overlay">
      <div className="debug-container">
        {/* Header */}
        <div className="debug-viewer-header">
          <h3 className="debug-title">Debug Logs</h3>
          <div className="debug-header-controls">
            {stats && (
              <span className="debug-stats">
                Total: {stats.total} | Errors: {stats.byLevel.error} | Warns: {stats.byLevel.warn}
              </span>
            )}
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`debug-toggle-btn ${autoRefresh ? '' : 'off'}`}
            >
              Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={loadLogs}
              disabled={loading}
              className="debug-action-btn"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button type="button" onClick={exportLogs} className="debug-action-btn export">
              Export
            </button>
            <button type="button" onClick={clearAllLogs} className="debug-action-btn clear">
              Clear
            </button>
            <button type="button" onClick={onClose} className="debug-action-btn close">
              Close
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="debug-filters">
          <div className="debug-filter-group">
            <span className="debug-filter-label">Search:</span>
            <input
              type="text"
              value={filter.searchText || ''}
              onChange={(e) => setFilter((prev) => ({ ...prev, searchText: e.target.value }))}
              placeholder="Filter by message content..."
              className="debug-search-input"
            />
          </div>
          <div className="debug-filter-group">
            <span className="debug-filter-label">Levels:</span>
            {(['debug', 'info', 'warn', 'error'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => handleLevelToggle(level)}
                className={`debug-level-btn ${filter.levels.includes(level) ? `active-${level}` : ''}`}
              >
                {level}
              </button>
            ))}
          </div>

          <div className="debug-filter-group">
            <span className="debug-filter-label">Contexts:</span>
            {(['background', 'sidepanel', 'content', 'options'] as const).map((context) => (
              <button
                key={context}
                type="button"
                onClick={() => handleContextToggle(context)}
                className={`debug-context-btn ${filter.contexts.includes(context) ? `active-${context}` : ''}`}
              >
                {context}
              </button>
            ))}
          </div>

          <div className="debug-filter-group">
            <label htmlFor={selectId} className="debug-filter-label">
              Limit:
            </label>
            <select
              id={selectId}
              value={filter.limit}
              onChange={(e) => setFilter((prev) => ({ ...prev, limit: Number(e.target.value) }))}
              className="debug-select"
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
        <div className="debug-logs-container">
          {loading && <div className="debug-loading">Loading logs...</div>}

          {!loading && logs.length === 0 && (
            <div className="debug-no-logs">
              No logs found. Try adjusting your filters or check if debug mode is enabled.
            </div>
          )}

          {logs.map((log) => (
            <div key={log.id} className={`debug-log-entry ${log.level}`}>
              <div className="debug-log-meta">
                <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className={`debug-log-level ${log.level}`}>{log.level}</span>
                <span className={`debug-log-context ${log.context}`}>{log.context}</span>
              </div>
              <div className="debug-log-message">{log.message}</div>
              {log.data && (
                <details className="debug-log-data">
                  <summary>Data</summary>
                  <pre>{JSON.stringify(log.data, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="debug-footer">
          <span>
            Showing {logs.length} logs
            {filter.since && ` since ${new Date(filter.since).toLocaleString()}`}
          </span>
          <div className="debug-footer-controls">
            <button
              type="button"
              onClick={() => setFilter((prev) => ({ ...prev, since: Date.now() - 60 * 60 * 1000 }))}
              className="debug-time-btn"
            >
              Last Hour
            </button>
            <button
              type="button"
              onClick={() => setFilter((prev) => ({ ...prev, since: Date.now() - 10 * 60 * 1000 }))}
              className="debug-time-btn"
            >
              Last 10min
            </button>
            <button
              type="button"
              onClick={() => setFilter((prev) => ({ ...prev, since: undefined }))}
              className="debug-time-btn"
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
