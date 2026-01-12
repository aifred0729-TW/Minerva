/**
 * Custom Graph Node Service
 * Handles serialization/deserialization and data management for custom nodes
 * stored in the agentstorage table
 * 
 * @module customGraphNodeService
 * @version 2.0.0 - Optimized
 */

import type {
  CustomGraphNode,
  CreateCustomGraphNodeInput,
  UpdateCustomGraphNodeInput,
} from '../types/customGraphNode';

// Debug mode - set to false in production
const DEBUG = false;
const log = (...args: any[]) => DEBUG && console.log('[CustomNodeService]', ...args);

// Constants
const NODE_PREFIX = 'minerva_customnode_';
const EDGE_PREFIX = 'minerva_graphedge_';
const NODE_ID_REGEX = /^minerva_customnode_(\d+)$/;

/**
 * Custom Graph Edge Interface
 */
export interface CustomGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceId: number | string;
  targetId: number | string;
  c2profile: string;
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate unique_id for agentstorage
 */
export const generateUniqueId = (id: number): string => `${NODE_PREFIX}${id}`;

/**
 * Generate unique_id for graph edge in agentstorage
 */
export const generateEdgeUniqueId = (edgeId: string): string => `${EDGE_PREFIX}${edgeId}`;

/**
 * Extract ID from unique_id
 */
export function extractIdFromUniqueId(uniqueId: string): number {
  const match = uniqueId.match(NODE_ID_REGEX);
  if (!match) {
    throw new Error(`Invalid unique_id format: ${uniqueId}`);
  }
  return parseInt(match[1], 10);
}

/**
 * Generate next available ID based on existing nodes
 */
export function generateNextId(existingNodes: CustomGraphNode[]): number {
  if (!existingNodes.length) return 1;
  return Math.max(...existingNodes.map(n => n.id)) + 1;
}

// ============================================================================
// Serialization / Deserialization
// ============================================================================

/**
 * Safe base64 encode with Unicode support
 */
const safeBase64Encode = (str: string): string => {
  return btoa(unescape(encodeURIComponent(str)));
};

/**
 * Safe base64 decode with Unicode support
 */
const safeBase64Decode = (str: string): string => {
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch {
    return atob(str);
  }
};

/**
 * Decode hex string to regular string
 */
const hexToString = (hex: string): string => {
  const bytes = hex.match(/.{1,2}/g);
  if (!bytes) throw new Error('Invalid hex string');
  return bytes.map(byte => String.fromCharCode(parseInt(byte, 16))).join('');
};

/**
 * Serialize data to bytea format (base64 encoded JSON)
 */
export const serializeNodeData = (node: CustomGraphNode): string => {
  return safeBase64Encode(JSON.stringify(node));
};

/**
 * Serialize edge data to bytea format
 */
export const serializeEdgeData = (edge: CustomGraphEdge): string => {
  return safeBase64Encode(JSON.stringify(edge));
};

/**
 * Parse data that could be in multiple formats
 * Handles: direct object, JSON string, base64, hex-encoded base64
 */
function parseStorageData<T>(data: any): T {
  // Already an object
  if (typeof data === 'object' && data !== null) {
    return data as T;
  }

  if (typeof data !== 'string') {
    throw new Error(`Unexpected data type: ${typeof data}`);
  }

  // Try direct JSON parse
  try {
    return JSON.parse(data) as T;
  } catch { /* continue */ }

  // Try hex format (\x...)
  if (data.startsWith('\\x')) {
    try {
      const base64 = hexToString(data.substring(2));
      return JSON.parse(safeBase64Decode(base64)) as T;
    } catch { /* continue */ }
  }

  // Try base64 decode
  try {
    return JSON.parse(safeBase64Decode(data)) as T;
  } catch {
    throw new Error('Failed to parse storage data');
  }
}

/**
 * Deserialize node data from agentstorage
 */
export const deserializeNodeData = (data: any): CustomGraphNode => {
  log('deserializeNodeData input:', typeof data);
  return parseStorageData<CustomGraphNode>(data);
};

/**
 * Deserialize edge data from agentstorage
 */
export const deserializeEdgeData = (data: any): CustomGraphEdge => {
  log('deserializeEdgeData input:', typeof data);
  return parseStorageData<CustomGraphEdge>(data);
};

// ============================================================================
// Data Preparation
// ============================================================================

/**
 * Prepare data for CREATE mutation
 */
export function prepareCreateNodeData(
  input: CreateCustomGraphNodeInput,
  id: number
): { unique_id: string; data: string } {
  const node: CustomGraphNode = {
    id,
    hostname: input.hostname,
    ip_address: input.ip_address,
    operating_system: input.operating_system,
    architecture: input.architecture,
    username: input.username,
    description: input.description,
    hidden: false,
    timestamp: new Date().toISOString(),
    position: input.position,
  };

  return {
    unique_id: generateUniqueId(id),
    data: serializeNodeData(node),
  };
}

/**
 * Prepare data for UPDATE mutation
 */
export function prepareUpdateNodeData(
  input: UpdateCustomGraphNodeInput
): { unique_id: string; data: string } {
  const node: CustomGraphNode = {
    id: input.id,
    hostname: input.hostname,
    ip_address: input.ip_address,
    operating_system: input.operating_system,
    architecture: input.architecture,
    username: input.username,
    description: input.description,
    hidden: input.hidden ?? false,
    timestamp: new Date().toISOString(),
    position: input.position,
    parent_id: input.parent_id,
    parent_type: input.parent_type,
    c2profile: input.c2profile,
  };

  return {
    unique_id: generateUniqueId(input.id),
    data: serializeNodeData(node),
  };
}

// ============================================================================
// Batch Parsing
// ============================================================================

/**
 * Parse agentstorage query results into CustomGraphNode array
 */
export function parseAgentStorageResults(results: any[]): CustomGraphNode[] {
  log('Processing', results.length, 'node items');
  
  const nodes: CustomGraphNode[] = [];
  
  for (const item of results) {
    try {
      nodes.push(deserializeNodeData(item.data));
    } catch (error) {
      console.error('[parseAgentStorageResults] Failed to parse:', item.unique_id);
    }
  }
  
  log('Successfully parsed', nodes.length, 'nodes');
  return nodes;
}

/**
 * Parse agentstorage results for graph edges
 */
export function parseEdgeStorageResults(results: any[]): CustomGraphEdge[] {
  log('Processing', results.length, 'edge items');
  
  const edges: CustomGraphEdge[] = [];
  
  for (const item of results) {
    try {
      edges.push(deserializeEdgeData(item.data));
    } catch (error) {
      console.error('[parseEdgeStorageResults] Failed to parse:', item.unique_id);
    }
  }
  
  log('Successfully parsed', edges.length, 'edges');
  return edges;
}

// ============================================================================
// Validation
// ============================================================================

// IP validation regex (IPv4 and IPv6)
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;
const IPV6_REGEX = /^(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}$/i;

/**
 * Validate node input data
 */
export function validateNodeInput(
  input: CreateCustomGraphNodeInput | UpdateCustomGraphNodeInput
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.hostname?.trim()) {
    errors.push('Hostname is required');
  }

  const ip = input.ip_address?.trim();
  if (!ip) {
    errors.push('IP Address is required');
  } else if (!IPV4_REGEX.test(ip) && !IPV6_REGEX.test(ip)) {
    errors.push('Invalid IP Address format');
  }

  if (!input.operating_system?.trim()) {
    errors.push('Operating System is required');
  }

  if (!input.architecture?.trim()) {
    errors.push('Architecture is required');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Migration
// ============================================================================

/**
 * Migrate data from old localStorage format to agentstorage
 */
export function migrateFromLocalStorage(): CreateCustomGraphNodeInput[] | null {
  try {
    const oldData = localStorage.getItem('customNodes');
    if (!oldData) return null;

    const parsedData = JSON.parse(oldData);
    if (!Array.isArray(parsedData)) return null;

    const nodesToMigrate = parsedData.map((node: any) => ({
      hostname: node.host || node.hostname,
      ip_address: node.ip || node.ip_address,
      operating_system: node.os || node.operating_system,
      architecture: node.architecture,
      username: node.user !== 'N/A' ? node.user : undefined,
      description: node.description || '',
      position: node.position,
    }));

    localStorage.removeItem('customNodes');
    return nodesToMigrate;
  } catch {
    console.error('[Migration] Failed to migrate from localStorage');
    return null;
  }
}
