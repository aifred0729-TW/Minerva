/**
 * Custom Graph Node Types for Minerva Callback Graph
 * These nodes are stored in the agentstorage table for multi-user collaboration
 */

/**
 * Core Custom Graph Node interface
 */
export interface CustomGraphNode {
  id: number;
  hostname: string;
  ip_address: string;
  operating_system: string;
  architecture: string;
  username?: string;
  description?: string;
  hidden?: boolean;
  timestamp: string;
  // Position data for the graph layout
  position?: {
    x: number;
    y: number;
  };
  // Parent connection info
  parent_id?: number | string; // Can be callback display_id or custom node id
  parent_type?: 'callback' | 'custom'; // Type of parent node
  c2profile?: string; // C2 profile used for connection
}

/**
 * Internal representation used in CallbackGraph component
 */
export interface CustomGraphNodeInternal {
  id: string; // Format: "custom-{db_id}"
  db_id: number;
  display_id: number; // Same as db_id, for compatibility with callback structure
  host: string;
  ip: string;
  os: string;
  architecture: string;
  user: string;
  description: string;
  isHidden: boolean;
  isCustom: true;
  timestamp: string;
  position?: {
    x: number;
    y: number;
  };
  parent_id?: number | string;
  parent_type?: 'callback' | 'custom';
  c2profile?: string;
}

/**
 * Input for creating a new custom node
 */
export interface CreateCustomGraphNodeInput {
  hostname: string;
  ip_address: string;
  operating_system: string;
  architecture: string;
  username?: string;
  description?: string;
  position?: {
    x: number;
    y: number;
  };
}

/**
 * Input for updating an existing custom node
 */
export interface UpdateCustomGraphNodeInput {
  id: number;
  hostname: string;
  ip_address: string;
  operating_system: string;
  architecture: string;
  username?: string;
  description?: string;
  hidden?: boolean;
  position?: {
    x: number;
    y: number;
  };
  parent_id?: number | string;
  parent_type?: 'callback' | 'custom';
  c2profile?: string;
}

/**
 * Standard mutation response structure
 */
export interface MutationResponse {
  status: 'success' | 'error';
  error?: string;
  id?: number;
}

/**
 * Agentstorage data structure for storing custom nodes
 */
export interface AgentStorageCustomNode {
  unique_id: string; // Format: "minerva_customnode_{id}"
  data: CustomGraphNode; // Will be serialized to bytea
}

/**
 * Query result from agentstorage
 */
export interface AgentStorageQueryResult {
  id: number;
  unique_id: string;
  data: string | CustomGraphNode; // May come as string and need parsing
}

/**
 * Convert CustomGraphNode to CustomGraphNodeInternal for UI
 */
export function toInternalNode(node: CustomGraphNode): CustomGraphNodeInternal {
  return {
    id: `custom-${node.id}`,
    db_id: node.id,
    display_id: node.id, // Use db_id as display_id for compatibility
    host: node.hostname,
    ip: node.ip_address,
    os: node.operating_system,
    architecture: node.architecture,
    user: node.username || 'N/A',
    description: node.description || '',
    isHidden: node.hidden || false,
    isCustom: true,
    timestamp: node.timestamp,
    position: node.position,
    parent_id: node.parent_id,
    parent_type: node.parent_type,
    c2profile: node.c2profile,
  };
}

/**
 * Convert CustomGraphNodeInternal back to CustomGraphNode for storage
 */
export function fromInternalNode(node: CustomGraphNodeInternal): CustomGraphNode {
  return {
    id: node.db_id,
    hostname: node.host,
    ip_address: node.ip,
    operating_system: node.os,
    architecture: node.architecture,
    username: node.user !== 'N/A' ? node.user : undefined,
    description: node.description,
    hidden: node.isHidden,
    timestamp: node.timestamp,
    position: node.position,
    parent_id: node.parent_id,
    parent_type: node.parent_type,
    c2profile: node.c2profile,
  };
}
