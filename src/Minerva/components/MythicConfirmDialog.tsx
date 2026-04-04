// ═══════════════════════════════════════════════════════════════════
//  MythicConfirmDialog — simple confirmation dialog
//  (Minerva-native)
// ═══════════════════════════════════════════════════════════════════
import React from 'react';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import { MythicDialog } from './MythicDialog';

interface MythicConfirmDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: () => void;
    title?: string;
    dialogText?: string;
    cancelText?: string;
    acceptText?: string;
    acceptColor?: 'error' | 'primary' | 'secondary' | 'success' | 'warning' | 'info';
    dontCloseOnSubmit?: boolean;
}

export function MythicConfirmDialog(props: MythicConfirmDialogProps) {
    const handleSubmit = () => {
        props.onSubmit();
        if (props.dontCloseOnSubmit) return;
        props.onClose();
    };

    return (
        <MythicDialog
            fullWidth={false}
            maxWidth="sm"
            open={props.open}
            onClose={props.onClose}
            innerDialog={
                <>
                    <DialogTitle>{props.title ?? 'Are you sure?'}</DialogTitle>
                    {props.dialogText !== undefined && (
                        <DialogContent dividers style={{ maxHeight: 'calc(70vh)' }}>
                            <DialogContentText>{props.dialogText}</DialogContentText>
                        </DialogContent>
                    )}
                    <DialogActions>
                        <Button onClick={props.onClose} variant="contained" color="primary">
                            {props.cancelText ?? 'Cancel'}
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            autoFocus
                            variant="contained"
                            color={props.acceptColor ?? 'error'}
                        >
                            {props.acceptText ?? 'Remove'}
                        </Button>
                    </DialogActions>
                </>
            }
        />
    );
}
