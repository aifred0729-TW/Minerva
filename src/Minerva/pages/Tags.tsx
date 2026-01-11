import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Tag, 
    Plus, 
    Trash2, 
    Edit2, 
    X,
    Loader2,
    Hash,
    Palette,
    FileText,
    Save,
    AlertCircle
} from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { cn } from '../lib/utils';
import { snackActions } from '../../Archive/components/utilities/Snackbar';

// ============================================
// GraphQL Queries & Mutations
// ============================================
const GET_TAGTYPES = gql`
query getOperationTags {
  tagtype(order_by: {name: asc}) {
    id
    color
    description
    name
    tags_aggregate {
      aggregate {
        count
      }
    }
  }
}
`;

const CREATE_TAGTYPE = gql`
mutation createTagtype($name: String!, $description: String!, $color: String!) {
  createTagtype(name: $name, description: $description, color: $color) {
    status
    error
    id
    name
    description
    color
  }
}
`;

const UPDATE_TAGTYPE = gql`
mutation updateTagtype($id: Int!, $name: String!, $description: String!, $color: String!) {
  updateTagtype(id: $id, name: $name, description: $description, color: $color) {
    status
    error
    id
    name
    description
    color
  }
}
`;

const DELETE_TAGTYPE = gql`
mutation tagtypeDeleteMutation($id: Int!) {
  deleteTagtype(id: $id) {
      status
      error
      tagtype_id
  }
}
`;

// ============================================
// Types
// ============================================
interface Tagtype {
    id: number;
    name: string;
    description: string;
    color: string;
    tags_aggregate: {
        aggregate: {
            count: number;
        };
    };
}

// ============================================
// Predefined Colors
// ============================================
const PRESET_COLORS = [
    '#22d3ee', // cyan (signal)
    '#10b981', // green (matrix)
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#3b82f6', // blue
    '#f97316', // orange
    '#14b8a6', // teal
    '#6366f1', // indigo
];

// ============================================
// Tag Type Card Component
// ============================================
const TagTypeCard = ({ 
    tagtype, 
    onEdit, 
    onDelete 
}: { 
    tagtype: Tagtype; 
    onEdit: () => void; 
    onDelete: () => void;
}) => {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-4 bg-black/30 border border-ghost/20 rounded-lg hover:border-ghost/40 transition-colors"
        >
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${tagtype.color}20`, borderColor: `${tagtype.color}50`, border: `1px solid ${tagtype.color}50` }}
                    >
                        <Tag size={20} style={{ color: tagtype.color }} />
                    </div>
                    <div>
                        <h3 className="text-white font-medium">{tagtype.name}</h3>
                        <p className="text-gray-500 text-sm">{tagtype.description || 'No description'}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <span 
                        className="px-2 py-1 rounded text-xs font-mono"
                        style={{ backgroundColor: `${tagtype.color}20`, color: tagtype.color }}
                    >
                        {tagtype.tags_aggregate.aggregate.count} items
                    </span>
                    <button
                        onClick={onEdit}
                        className="p-1.5 rounded hover:bg-ghost/20 text-gray-400 hover:text-signal transition-colors"
                    >
                        <Edit2 size={16} />
                    </button>
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            {/* Delete Confirmation */}
            <AnimatePresence>
                {showDeleteConfirm && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 pt-4 border-t border-ghost/20"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-red-400">
                                <AlertCircle size={16} />
                                <span className="text-sm">Delete this tag type and all associated tags?</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => { onDelete(); setShowDeleteConfirm(false); }}
                                    className="px-3 py-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ============================================
// Tag Type Editor Modal
// ============================================
const TagTypeEditor = ({ 
    tagtype, 
    isOpen, 
    onClose, 
    onSave 
}: { 
    tagtype: Tagtype | null; 
    isOpen: boolean; 
    onClose: () => void; 
    onSave: (data: { name: string; description: string; color: string }) => void;
}) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState(PRESET_COLORS[0]);

    useEffect(() => {
        if (tagtype) {
            setName(tagtype.name);
            setDescription(tagtype.description);
            setColor(tagtype.color);
        } else {
            setName('');
            setDescription('');
            setColor(PRESET_COLORS[0]);
        }
    }, [tagtype, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            snackActions.warning('Name is required');
            return;
        }
        onSave({ name: name.trim(), description: description.trim(), color });
    };

    if (!isOpen) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-void border border-ghost/30 rounded-lg w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-ghost/30 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-signal">
                        {tagtype ? 'Edit Tag Type' : 'Create Tag Type'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-ghost/20 rounded transition-colors"
                    >
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="text-sm text-gray-400 flex items-center gap-2 mb-2">
                            <Hash size={14} />
                            Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Tag type name"
                            className="w-full h-10 px-3 bg-black/50 border border-ghost/30 rounded text-white placeholder-gray-600 focus:border-signal/50 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-gray-400 flex items-center gap-2 mb-2">
                            <FileText size={14} />
                            Description
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional description"
                            rows={3}
                            className="w-full px-3 py-2 bg-black/50 border border-ghost/30 rounded text-white placeholder-gray-600 focus:border-signal/50 focus:outline-none resize-none"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-gray-400 flex items-center gap-2 mb-2">
                            <Palette size={14} />
                            Color
                        </label>
                        <div className="flex items-center gap-3">
                            <div className="flex flex-wrap gap-2">
                                {PRESET_COLORS.map((presetColor) => (
                                    <button
                                        key={presetColor}
                                        type="button"
                                        onClick={() => setColor(presetColor)}
                                        className={cn(
                                            "w-8 h-8 rounded-lg transition-transform",
                                            color === presetColor && "ring-2 ring-white ring-offset-2 ring-offset-void scale-110"
                                        )}
                                        style={{ backgroundColor: presetColor }}
                                    />
                                ))}
                            </div>
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className="w-10 h-10 rounded cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="pt-4 border-t border-ghost/20">
                        <label className="text-sm text-gray-500 mb-2 block">Preview</label>
                        <div className="flex items-center gap-3">
                            <span 
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm"
                                style={{ 
                                    backgroundColor: `${color}20`, 
                                    borderColor: `${color}50`,
                                    color: color,
                                    border: `1px solid ${color}50`
                                }}
                            >
                                <Tag size={14} />
                                {name || 'Tag Name'}
                            </span>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex items-center gap-2 px-4 py-2 bg-signal hover:bg-signal/80 text-void font-medium rounded transition-colors"
                        >
                            <Save size={16} />
                            {tagtype ? 'Update' : 'Create'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
};

// ============================================
// Main Tags Page
// ============================================
const Tags = () => {
    const [tagtypes, setTagtypes] = useState<Tagtype[]>([]);
    const [loading, setLoading] = useState(true);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingTagtype, setEditingTagtype] = useState<Tagtype | null>(null);
    const mountedRef = useRef(true);

    // Fetch tag types
    useQuery(GET_TAGTYPES, {
        fetchPolicy: "no-cache",
        onCompleted: (data) => {
            if (mountedRef.current) {
                setTagtypes(data.tagtype);
                setLoading(false);
            }
        },
        onError: () => {
            snackActions.error('Failed to load tag types');
            setLoading(false);
        }
    });

    // Create mutation
    const [createTagtype] = useMutation(CREATE_TAGTYPE, {
        onCompleted: (data) => {
            if (data.createTagtype.status === "success") {
                const newTagtype = {
                    id: data.createTagtype.id,
                    name: data.createTagtype.name,
                    description: data.createTagtype.description,
                    color: data.createTagtype.color,
                    tags_aggregate: { aggregate: { count: 0 } }
                };
                setTagtypes([...tagtypes, newTagtype]);
                snackActions.success('Tag type created');
                setEditorOpen(false);
            } else {
                snackActions.error(data.createTagtype.error);
            }
        },
        onError: () => {
            snackActions.error('Failed to create tag type');
        }
    });

    // Update mutation
    const [updateTagtype] = useMutation(UPDATE_TAGTYPE, {
        onCompleted: (data) => {
            if (data.updateTagtype.status === "success") {
                setTagtypes(tagtypes.map(t => 
                    t.id === data.updateTagtype.id 
                        ? { ...t, name: data.updateTagtype.name, description: data.updateTagtype.description, color: data.updateTagtype.color }
                        : t
                ));
                snackActions.success('Tag type updated');
                setEditorOpen(false);
                setEditingTagtype(null);
            } else {
                snackActions.error(data.updateTagtype.error);
            }
        },
        onError: () => {
            snackActions.error('Failed to update tag type');
        }
    });

    // Delete mutation
    const [deleteTagtype] = useMutation(DELETE_TAGTYPE, {
        onCompleted: (data) => {
            if (data.deleteTagtype.status === "success") {
                setTagtypes(tagtypes.filter(t => t.id !== data.deleteTagtype.tagtype_id));
                snackActions.success('Tag type deleted');
            } else {
                snackActions.error(data.deleteTagtype.error);
            }
        },
        onError: () => {
            snackActions.error('Failed to delete tag type');
        }
    });

    useEffect(() => {
        return () => { mountedRef.current = false; };
    }, []);

    const handleSave = (data: { name: string; description: string; color: string }) => {
        if (editingTagtype) {
            updateTagtype({ variables: { id: editingTagtype.id, ...data } });
        } else {
            createTagtype({ variables: data });
        }
    };

    const handleEdit = (tagtype: Tagtype) => {
        setEditingTagtype(tagtype);
        setEditorOpen(true);
    };

    const handleCreate = () => {
        setEditingTagtype(null);
        setEditorOpen(true);
    };

    const handleCloseEditor = () => {
        setEditorOpen(false);
        setEditingTagtype(null);
    };

    return (
        <div className="flex h-screen bg-void">
            <Sidebar />
            
            <div className="flex-1 flex flex-col min-w-0 ml-16">
                {/* Header */}
                <div className="h-16 border-b border-ghost/30 flex items-center justify-between px-6 bg-void/90 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded bg-signal/10 border border-signal/30 flex items-center justify-center">
                            <Tag size={20} className="text-signal" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-wide">TAGS</h1>
                            <p className="text-xs text-gray-500 font-mono">
                                {tagtypes.length} tag types
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handleCreate}
                        className="flex items-center gap-2 px-4 py-2 bg-signal hover:bg-signal/80 text-void font-medium rounded transition-colors"
                    >
                        <Plus size={16} />
                        New Tag Type
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 size={32} className="text-signal animate-spin" />
                        </div>
                    ) : tagtypes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <Tag size={48} className="mb-4" />
                            <p className="text-lg">No tag types found</p>
                            <button
                                onClick={handleCreate}
                                className="mt-4 flex items-center gap-2 px-4 py-2 bg-signal/10 hover:bg-signal/20 border border-signal/30 text-signal rounded transition-colors"
                            >
                                <Plus size={16} />
                                Create your first tag type
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
                            <AnimatePresence>
                                {tagtypes.map((tagtype) => (
                                    <TagTypeCard
                                        key={tagtype.id}
                                        tagtype={tagtype}
                                        onEdit={() => handleEdit(tagtype)}
                                        onDelete={() => deleteTagtype({ variables: { id: tagtype.id } })}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>

            {/* Editor Modal */}
            <AnimatePresence>
                {editorOpen && (
                    <TagTypeEditor
                        tagtype={editingTagtype}
                        isOpen={editorOpen}
                        onClose={handleCloseEditor}
                        onSave={handleSave}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Tags;
