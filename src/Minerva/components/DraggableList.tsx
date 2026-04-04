import React from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { GripVertical } from 'lucide-react';
import { cn } from '../lib/utils';

interface DraggableListProps<T> {
    items: T[];
    keyExtractor: (item: T) => string;
    onReorder: (items: T[]) => void;
    renderItem: (item: T, index: number) => React.ReactNode;
    droppableId?: string;
    className?: string;
    itemClassName?: string;
}

export function DraggableList<T>({
    items, keyExtractor, onReorder, renderItem,
    droppableId = 'draggable-list', className, itemClassName,
}: DraggableListProps<T>) {
    const handleDragEnd = (result: DropResult) => {
        if (!result.destination || result.source.index === result.destination.index) return;
        const reordered = Array.from(items);
        const [moved] = reordered.splice(result.source.index, 1);
        reordered.splice(result.destination.index, 0, moved);
        onReorder(reordered);
    };

    return (
        <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId={droppableId}>
                {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className={className}>
                        {items.map((item, index) => {
                            const key = keyExtractor(item);
                            return (
                                <Draggable key={key} draggableId={key} index={index}>
                                    {(dragProvided, snapshot) => (
                                        <div
                                            ref={dragProvided.innerRef}
                                            {...dragProvided.draggableProps}
                                            className={cn(
                                                'flex items-center gap-2 transition-colors',
                                                snapshot.isDragging && 'bg-signal/10 shadow-lg shadow-signal/5',
                                                itemClassName,
                                            )}
                                        >
                                            <div {...dragProvided.dragHandleProps}
                                                className="shrink-0 cursor-grab active:cursor-grabbing text-gray-500 hover:text-signal transition-colors p-1">
                                                <GripVertical size={14} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                {renderItem(item, index)}
                                            </div>
                                        </div>
                                    )}
                                </Draggable>
                            );
                        })}
                        {provided.placeholder}
                    </div>
                )}
            </Droppable>
        </DragDropContext>
    );
}
