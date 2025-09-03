import { type ZodTypeAny, z } from 'zod/v3';
import { availableTools } from './ai-tools';
import { createLogger } from './debug-logger';

export interface ToolMetadata {
  name: string;
  description: string;
  parameters: ParameterDefinition[];
}

export interface ParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object';
  description?: string;
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
  properties?: ParameterDefinition[]; // For nested objects
}

/**
 * Extract metadata from Zod schema definitions
 */
function extractZodSchemaInfo(
  schema: ZodTypeAny,
  name: string = '',
  required: boolean = true,
): ParameterDefinition {
  // Handle optional schemas
  if (schema._def?.typeName === 'ZodOptional') {
    return extractZodSchemaInfo(schema._def.innerType, name, false);
  }

  // Handle default values
  if (schema._def?.typeName === 'ZodDefault') {
    const inner = extractZodSchemaInfo(schema._def.innerType, name, required);
    inner.defaultValue = schema._def.defaultValue();
    return inner;
  }

  // Handle preprocessed schemas (like our boolean conversion)
  if (schema._def?.typeName === 'ZodEffects') {
    return extractZodSchemaInfo(schema._def.schema, name, required);
  }

  const baseParam: ParameterDefinition = {
    name,
    type: 'string',
    required,
    description: schema.description || schema._def?.description,
  };

  switch (schema._def?.typeName) {
    case 'ZodString':
      baseParam.type = 'string';
      break;

    case 'ZodNumber':
      baseParam.type = 'number';
      break;

    case 'ZodBoolean':
      baseParam.type = 'boolean';
      break;

    case 'ZodEnum':
      baseParam.type = 'enum';
      baseParam.enumValues = schema._def.values;
      break;

    case 'ZodObject': {
      baseParam.type = 'object';
      baseParam.properties = [];

      const shape = schema._def.shape();
      for (const [key, value] of Object.entries(shape)) {
        const typedValue = value as ZodTypeAny;
        const isRequired =
          !schema._def.unknownKeys && !(typedValue._def?.typeName === 'ZodOptional');
        baseParam.properties.push(extractZodSchemaInfo(typedValue, key, isRequired));
      }
      break;
    }

    default:
      // Fallback to string for unknown types
      baseParam.type = 'string';
      break;
  }

  return baseParam;
}

/**
 * Extract metadata from all available AI SDK tools
 */
export function extractToolsMetadata(): ToolMetadata[] {
  const logger = createLogger('background');
  const toolsMetadata: ToolMetadata[] = [];

  for (const [toolName, toolDefinition] of Object.entries(availableTools)) {
    try {
      const metadata: ToolMetadata = {
        name: toolName,
        description:
          (toolDefinition as { description?: string }).description || `Execute ${toolName} tool`,
        parameters: [],
      };

      // Extract schema information
      const inputSchema = (toolDefinition as { inputSchema?: ZodTypeAny }).inputSchema;
      if (inputSchema && inputSchema._def?.typeName === 'ZodObject') {
        const shape = inputSchema._def.shape();

        for (const [paramName, paramSchema] of Object.entries(shape)) {
          const typedSchema = paramSchema as ZodTypeAny;
          const isRequired = !(typedSchema._def?.typeName === 'ZodOptional');

          metadata.parameters.push(extractZodSchemaInfo(typedSchema, paramName, isRequired));
        }
      }

      toolsMetadata.push(metadata);
    } catch (error) {
      logger.warn(`Failed to extract metadata for tool ${toolName}`, { toolName, error });

      // Fallback metadata
      toolsMetadata.push({
        name: toolName,
        description: `Execute ${toolName} tool`,
        parameters: [],
      });
    }
  }

  return toolsMetadata;
}

/**
 * Get metadata for a specific tool
 */
export function getToolMetadata(toolName: string): ToolMetadata | undefined {
  return extractToolsMetadata().find((tool) => tool.name === toolName);
}

/**
 * Validate tool arguments against schema
 */
export function validateToolArguments(
  toolName: string,
  args: unknown,
): { valid: boolean; errors: string[] } {
  try {
    const tool = availableTools[toolName as keyof typeof availableTools];
    if (!tool) {
      return { valid: false, errors: [`Tool ${toolName} not found`] };
    }

    const inputSchema = (tool as { inputSchema?: ZodTypeAny }).inputSchema;
    if (inputSchema) {
      inputSchema.parse(args);
    }

    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map((err) => `${err.path.join('.')}: ${err.message}`),
      };
    }

    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Unknown validation error'],
    };
  }
}
