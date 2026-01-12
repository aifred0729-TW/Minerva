/**
 * Custom Graph Node Service
 * Handles serialization/deserialization and data management for custom nodes
 * stored in the agentstorage table
 */

import type {
  CustomGraphNode,
  CreateCustomGraphNodeInput,
  UpdateCustomGraphNodeInput,
} from '../types/customGraphNode';

/**
 * Generate unique_id for agentstorage
 */
export function generateUniqueId(id: number): string {
  return `minerva_customnode_${id}`;
}

/**
 * Extract ID from unique_id
 */
export function extractIdFromUniqueId(uniqueId: string): number {
  const match = uniqueId.match(/^minerva_customnode_(\d+)$/);
  if (!match) {
    throw new Error(`Invalid unique_id format: ${uniqueId}`);
  }
  return parseInt(match[1], 10);
}

/**
 * Generate next available ID
 * This should be called before creating a new node
 */
export function generateNextId(existingNodes: CustomGraphNode[]): number {
  if (existingNodes.length === 0) {
    return 1;
  }
  const maxId = Math.max(...existingNodes.map(n => n.id));
  return maxId + 1;
}

/**
 * Serialize CustomGraphNode to bytea format (base64 encoded JSON string)
 * PostgreSQL bytea columns expect base64 encoded data
 */
export function serializeNodeData(node: CustomGraphNode): string {
  const jsonString = JSON.stringify(node);
  // Convert to base64 for bytea storage (browser-compatible)
  return btoa(unescape(encodeURIComponent(jsonString)));
}

/**
 * Deserialize data from agentstorage bytea column
 * Handles both string and already-parsed object formats
 * Hasura may return bytea as: hex string (\\x...), base64, or decoded JSON
 */
export function deserializeNodeData(data: any): CustomGraphNode {
  console.log('[deserializeNodeData] Input type:', typeof data, 'Value:', data);
  
  // If data is already an object, return it
  if (typeof data === 'object' && data !== null) {
    console.log('[deserializeNodeData] Data is already an object');
    return data as CustomGraphNode;
  }

  // If data is a string, try multiple parsing strategies
  if (typeof data === 'string') {
    // Strategy 1: Try parsing as JSON directly (Hasura may auto-decode)
    try {
      const parsed = JSON.parse(data);
      console.log('[deserializeNodeData] Parsed as direct JSON');
      return parsed as CustomGraphNode;
    } catch (e1) {
      console.log('[deserializeNodeData] Not direct JSON, trying other formats...');
    }

    // Strategy 2: Handle Hasura hex format (\\x...)
    // PostgreSQL bytea hex format: \\x + hex digits
    // The hex digits encode a base64 string, which encodes the JSON
    if (data.startsWith('\\x')) {
      try {
        const hex = data.substring(2); // Remove \\x prefix
        // Convert hex to string (each pair of hex digits = 1 character)
        const base64String = hex.match(/.{1,2}/g)?.map(byte => String.fromCharCode(parseInt(byte, 16))).join('');
        if (base64String) {
          // Now decode the base64 string to get JSON
          const jsonString = decodeURIComponent(escape(atob(base64String)));
          const parsed = JSON.parse(jsonString);
          console.log('[deserializeNodeData] Parsed from hex->base64->JSON format');
          return parsed as CustomGraphNode;
        }
      } catch (e2) {
        console.log('[deserializeNodeData] Hex parsing failed:', e2);
      }
    }

    // Strategy 3: Try base64 decoding
    try {
      const decoded = decodeURIComponent(escape(atob(data)));
      const parsed = JSON.parse(decoded);
      console.log('[deserializeNodeData] Parsed from base64');
      return parsed as CustomGraphNode;
    } catch (e3) {
      console.log('[deserializeNodeData] Base64 parsing failed:', e3);
    }

    // Strategy 4: Simple base64 without URI encoding
    try {
      const decoded = atob(data);
      const parsed = JSON.parse(decoded);
      console.log('[deserializeNodeData] Parsed from simple base64');
      return parsed as CustomGraphNode;
    } catch (e4) {
      console.error('[deserializeNodeData] All parsing strategies failed:', e4);
      console.error('[deserializeNodeData] Original data:', data);
      throw new Error('Invalid node data format - could not parse');
    }
  }

  throw new Error('Unexpected data type in agentstorage');
}

/**
 * Prepare data for CREATE mutation
 */
export function prepareCreateNodeData(
  input: CreateCustomGraphNodeInput,
  id: number
): { unique_id: string; data: string } {
  const timestamp = new Date().toISOString();
  
  const node: CustomGraphNode = {
    id,
    hostname: input.hostname,
    ip_address: input.ip_address,
    operating_system: input.operating_system,
    architecture: input.architecture,
    username: input.username,
    description: input.description,
    hidden: false,
    timestamp,
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
  const timestamp = new Date().toISOString();
  
  const node: CustomGraphNode = {
    id: input.id,
    hostname: input.hostname,
    ip_address: input.ip_address,
    operating_system: input.operating_system,
    architecture: input.architecture,
    username: input.username,
    description: input.description,
    hidden: input.hidden || false,
    timestamp,
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

/**
 * Parse agentstorage query results into CustomGraphNode array
 */
export function parseAgentStorageResults(results: any[]): CustomGraphNode[] {
  console.log('[parseAgentStorageResults] Processing', results.length, 'items');
  
  const parsed = results
    .map((item, index) => {
      try {
        console.log(`[parseAgentStorageResults] Item ${index}:`, item);
        const node = deserializeNodeData(item.data);
        console.log(`[parseAgentStorageResults] Parsed node ${index}:`, node);
        // Ensure the ID from the data matches
        return node;
      } catch (error) {
        console.error('[parseAgentStorageResults] Failed to parse custom node:', item, error);
        return null;
      }
    })
    .filter((node): node is CustomGraphNode => node !== null);
  
  console.log('[parseAgentStorageResults] Successfully parsed', parsed.length, 'nodes');
  return parsed;
}

/**
 * Validate node input data
 */
export function validateNodeInput(
  input: CreateCustomGraphNodeInput | UpdateCustomGraphNodeInput
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.hostname || input.hostname.trim() === '') {
    errors.push('Hostname is required');
  }

  if (!input.ip_address || input.ip_address.trim() === '') {
    errors.push('IP Address is required');
  } else {
    // Basic IP validation (supports IPv4 and IPv6)
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}$/i;
    if (!ipRegex.test(input.ip_address.trim())) {
      errors.push('Invalid IP Address format');
    }
  }

  if (!input.operating_system || input.operating_system.trim() === '') {
    errors.push('Operating System is required');
  }

  if (!input.architecture || input.architecture.trim() === '') {
    errors.push('Architecture is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Migrate data from old localStorage format to agentstorage
 * This function can be called on app initialization
 */
export function migrateFromLocalStorage(): CreateCustomGraphNodeInput[] | null {
  try {
    const oldData = localStorage.getItem('customNodes');
    if (!oldData) {
      return null;
    }

    const parsedData = JSON.parse(oldData);
    if (!Array.isArray(parsedData)) {
      return null;
    }

    // Convert old format to new format
    const nodesToMigrate: CreateCustomGraphNodeInput[] = parsedData.map((node: any) => ({
      hostname: node.host || node.hostname,
      ip_address: node.ip || node.ip_address,
      operating_system: node.os || node.operating_system,
      architecture: node.architecture,
      username: node.user !== 'N/A' ? node.user : undefined,
      description: node.description || '',
      position: node.position,
    }));

    // Clear old localStorage data after migration
    localStorage.removeItem('customNodes');
    
    return nodesToMigrate;
  } catch (error) {
    console.error('Failed to migrate from localStorage:', error);
    return null;
  }
}

/**
 * Custom Edge Types for persistent storage
 */
export interface CustomGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceId: number | string;
  targetId: number | string;
  c2profile: string;
}

/**
 * Generate unique_id for graph edge in agentstorage
 */
export function generateEdgeUniqueId(edgeId: string): string {
  return `minerva_graphedge_${edgeId}`;
}

/**
 * Serialize edge data to bytea format
 */
export function serializeEdgeData(edge: CustomGraphEdge): string {
  const jsonString = JSON.stringify(edge);
  return btoa(unescape(encodeURIComponent(jsonString)));
}

/**
 * Deserialize edge data from agentstorage
 */
export function deserializeEdgeData(data: any): CustomGraphEdge {
  console.log('[deserializeEdgeData] Input type:', typeof data, 'Value:', data);
  
  if (typeof data === 'object' && data !== null) {
    return data as CustomGraphEdge;
  }

  if (typeof data === 'string') {
    // Try direct JSON parse
    try {
      const parsed = JSON.parse(data);
      return parsed as CustomGraphEdge;
    } catch (e1) {
      // Not direct JSON
    }

    // Handle hex format (\\x...)
    if (data.startsWith('\\x')) {
      try {
        const hex = data.substring(2);
        const base64String = hex.match(/.{1,2}/g)?.map(byte => String.fromCharCode(parseInt(byte, 16))).join('');
        if (base64String) {
          const jsonString = decodeURIComponent(escape(atob(base64String)));
          return JSON.parse(jsonString) as CustomGraphEdge;
        }
      } catch (e2) {
        console.error('[deserializeEdgeData] Hex parsing failed:', e2);
      }
    }

    // Try base64 decoding
    try {
      const decoded = decodeURIComponent(escape(atob(data)));
      return JSON.parse(decoded) as CustomGraphEdge;
    } catch (e3) {
      console.error('[deserializeEdgeData] Base64 parsing failed:', e3);
    }
  }

  throw new Error('Invalid edge data format - could not parse');
}

/**
 * Parse agentstorage results for graph edges
 */
export function parseEdgeStorageResults(results: any[]): CustomGraphEdge[] {
  console.log('[parseEdgeStorageResults] Processing', results.length, 'edge items');
  
  const edges: CustomGraphEdge[] = [];
  
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    console.log('[parseEdgeStorageResults] Edge item', i, ':', item);
    
    try {
      const edge = deserializeEdgeData(item.data);
      console.log('[parseEdgeStorageResults] Parsed edge', i, ':', edge);
      edges.push(edge);
    } catch (error) {
      console.error('[parseEdgeStorageResults] Failed to parse edge:', item, 'Error:', error);
    }
  }
  
  console.log('[parseEdgeStorageResults] Successfully parsed', edges.length, 'edges');
  return edges;
}
