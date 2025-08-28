import type React from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import {
  extractToolsMetadata,
  type ParameterDefinition,
  type ToolMetadata,
  validateToolArguments,
} from '~/utils/tool-metadata-extractor';

interface ManualToolInterfaceProps {
  onExecuteTool: (toolName: string, args: Record<string, unknown>) => Promise<void>;
  isExecuting?: boolean;
}

const ManualToolInterface: React.FC<ManualToolInterfaceProps> = ({
  onExecuteTool,
  isExecuting = false,
}) => {
  const selectId = useId();
  const [availableTools, setAvailableTools] = useState<ToolMetadata[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const initializeFormData = useCallback(
    (params: ParameterDefinition[], target: Record<string, unknown>, prefix: string = '') => {
      params.forEach((param) => {
        const key = prefix ? `${prefix}.${param.name}` : param.name;

        if (param.defaultValue !== undefined) {
          target[key] = param.defaultValue;
        } else if (param.type === 'boolean') {
          target[key] = false;
        } else if (param.type === 'number') {
          target[key] = 0;
        } else if (param.type === 'object' && param.properties) {
          target[key] = {};
          initializeFormData(param.properties, target, key);
        } else {
          target[key] = '';
        }
      });
    },
    [],
  );

  useEffect(() => {
    const tools = extractToolsMetadata();
    setAvailableTools(tools);

    // Select first tool by default
    if (tools.length > 0) {
      setSelectedTool(tools[0].name);
    }
  }, []);

  useEffect(() => {
    // Reset form when tool changes
    if (selectedTool) {
      const tool = availableTools.find((t) => t.name === selectedTool);
      if (tool) {
        const initialData: Record<string, unknown> = {};
        initializeFormData(tool.parameters, initialData);
        setFormData(initialData);
        setValidationErrors([]);
      }
    }
  }, [selectedTool, availableTools, initializeFormData]);

  const handleInputChange = (key: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));

    // Clear validation errors when user makes changes
    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
  };

  const handleExecute = async () => {
    if (!selectedTool) return;

    // Convert flat form data back to nested structure
    const args = convertFlatDataToNested(formData);

    // Validate arguments
    const validation = validateToolArguments(selectedTool, args);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    setValidationErrors([]);
    await onExecuteTool(selectedTool, args);
  };

  const convertFlatDataToNested = (flatData: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    Object.entries(flatData).forEach(([key, value]) => {
      const parts = key.split('.');
      let current = result;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }

      current[parts[parts.length - 1]] = value;
    });

    return result;
  };

  const renderFormField = (param: ParameterDefinition, prefix: string = ''): React.ReactNode => {
    const key = prefix ? `${prefix}.${param.name}` : param.name;
    const value = formData[key] ?? '';

    const fieldId = `field-${key}`;

    const renderField = () => {
      switch (param.type) {
        case 'boolean':
          return (
            <label className="tool-checkbox">
              <input
                id={fieldId}
                type="checkbox"
                checked={value === true}
                onChange={(e) => handleInputChange(key, e.target.checked)}
                disabled={isExecuting}
              />
              <span className="checkmark"></span>
              {param.name}
              {!param.required && <span className="optional"> (optional)</span>}
            </label>
          );

        case 'number':
          return (
            <div className="tool-field">
              <label htmlFor={fieldId} className="tool-label">
                {param.name}
                {!param.required && <span className="optional"> (optional)</span>}
              </label>
              <input
                id={fieldId}
                type="number"
                className="tool-input"
                value={typeof value === 'number' ? value : 0}
                onChange={(e) => handleInputChange(key, parseFloat(e.target.value) || 0)}
                disabled={isExecuting}
              />
            </div>
          );

        case 'enum':
          return (
            <div className="tool-field">
              <label htmlFor={fieldId} className="tool-label">
                {param.name}
                {!param.required && <span className="optional"> (optional)</span>}
              </label>
              <select
                id={fieldId}
                className="tool-select"
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => handleInputChange(key, e.target.value)}
                disabled={isExecuting}
              >
                <option value="">Select {param.name}</option>
                {param.enumValues?.map((enumValue) => (
                  <option key={enumValue} value={enumValue}>
                    {enumValue}
                  </option>
                ))}
              </select>
            </div>
          );

        case 'object':
          return (
            <div className="tool-object-field">
              <div className="tool-object-header">
                <strong>{param.name}</strong>
                {!param.required && <span className="optional"> (optional)</span>}
              </div>
              <div className="tool-object-content">
                {param.properties?.map((nestedParam) => (
                  <div key={nestedParam.name}>{renderFormField(nestedParam, key)}</div>
                ))}
              </div>
            </div>
          );

        default: // string
          return (
            <div className="tool-field">
              <label htmlFor={fieldId} className="tool-label">
                {param.name}
                {!param.required && <span className="optional"> (optional)</span>}
              </label>
              <input
                id={fieldId}
                type="text"
                className="tool-input"
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => handleInputChange(key, e.target.value)}
                disabled={isExecuting}
                placeholder={param.description ? `e.g. ${param.description}` : ''}
              />
            </div>
          );
      }
    };

    return (
      <div key={key} className="tool-parameter">
        {renderField()}
        {param.description && param.type !== 'boolean' && (
          <div className="tool-description">{param.description}</div>
        )}
      </div>
    );
  };

  const selectedToolData = availableTools.find((t) => t.name === selectedTool);

  return (
    <div className="manual-tool-interface">
      <div className="tool-header">
        <h4>Manual Tool Testing</h4>
      </div>

      <div className="tool-selector">
        <label htmlFor={selectId} className="tool-label">
          Select Tool:
        </label>
        <select
          id={selectId}
          className="tool-select tool-select-main"
          value={selectedTool}
          onChange={(e) => setSelectedTool(e.target.value)}
          disabled={isExecuting}
        >
          {availableTools.map((tool) => (
            <option key={tool.name} value={tool.name}>
              {tool.name} - {tool.description}
            </option>
          ))}
        </select>
      </div>

      {selectedToolData && (
        <div className="tool-form">
          {selectedToolData.parameters.length > 0 ? (
            <div className="tool-parameters">
              {selectedToolData.parameters.map((param) => renderFormField(param))}
            </div>
          ) : (
            <div className="no-parameters">This tool requires no parameters.</div>
          )}

          {validationErrors.length > 0 && (
            <div className="validation-errors">
              <strong>Validation Errors:</strong>
              <ul>
                {validationErrors.map((error, index) => (
                  <li key={`error-${index}-${error.slice(0, 20)}`}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            className="tool-execute-btn"
            onClick={handleExecute}
            disabled={isExecuting || !selectedTool}
          >
            {isExecuting ? 'Executing...' : `Execute ${selectedTool}`}
          </button>
        </div>
      )}
    </div>
  );
};

export default ManualToolInterface;
