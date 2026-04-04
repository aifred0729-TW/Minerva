// ═══════════════════════════════════════════════════════════════════
//  MythicSelectFromListDialog — select-from-list & raw-list dialogs
//  (Minerva-native)
// ═══════════════════════════════════════════════════════════════════
import React, { useRef, useEffect } from 'react';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import InputLabel from '@mui/material/InputLabel';
import Input from '@mui/material/Input';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableContainer from '@mui/material/TableContainer';
import Paper from '@mui/material/Paper';
import MythicStyledTableCell from './MythicTableCell';

interface MythicSelectFromListDialogProps {
    options: any[];
    onSubmit: (selected: any) => void;
    onClose: () => void;
    title: string;
    action: string;
    identifier: string;
    display: string;
    dontCloseOnSubmit?: boolean;
}

export function MythicSelectFromListDialog(props: MythicSelectFromListDialogProps) {
    const [options, setOptions] = React.useState<any[]>([]);
    const [selected, setSelected] = React.useState<string>('');
    const inputRef = useRef<HTMLLabelElement>(null);

    const handleChange = (event: any) => {
        setSelected(event.target.value);
    };

    const handleSubmit = () => {
        props.onSubmit(selected);
        if (props.dontCloseOnSubmit) return;
        props.onClose();
    };

    useEffect(() => {
        const opts = [...props.options];
        setOptions(opts);
        if (opts.length > 0) {
            setSelected(opts[0]);
        } else {
            setSelected('');
        }
    }, [props.options]);

    return (
        <>
            <DialogTitle>{props.title}</DialogTitle>
            <DialogContent dividers>
                <FormControl style={{ width: '100%' }}>
                    <InputLabel ref={inputRef}>Options</InputLabel>
                    <Select
                        labelId="demo-dialog-select-label"
                        id="demo-dialog-select"
                        value={selected}
                        onChange={handleChange}
                        input={<Input style={{ width: '100%' }} />}
                    >
                        <MenuItem value="">
                            <em>None</em>
                        </MenuItem>
                        {options.map((opt) => (
                            <MenuItem value={opt} key={opt[props.identifier]}>
                                {opt?.[props.display]}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </DialogContent>
            <DialogActions>
                <Button onClick={props.onClose} variant="contained" color="primary">
                    Close
                </Button>
                <Button onClick={handleSubmit} variant="contained" color="success">
                    {props.action}
                </Button>
            </DialogActions>
        </>
    );
}

interface MythicSelectFromRawListDialogProps {
    options: string[];
    onSubmit: (selected: string) => void;
    onClose: () => void;
    title: string;
}

export function MythicSelectFromRawListDialog(props: MythicSelectFromRawListDialogProps) {
    const [options, setOptions] = React.useState<string[]>([]);

    const handleSubmit = (selected: string) => {
        props.onSubmit(selected);
        props.onClose();
    };

    useEffect(() => {
        setOptions([...props.options]);
    }, [props.options]);

    return (
        <>
            <DialogTitle>{props.title}</DialogTitle>
            <div style={{ height: '100%', display: 'flex' }}>
                <TableContainer component={Paper} className="mythicElement" style={{ flexGrow: 1, overflowY: 'auto' }}>
                    <Table size="small" style={{ maxWidth: '100%', overflow: 'scroll' }}>
                        <TableBody style={{ whiteSpace: 'pre' }}>
                            {options.map((choice, i) => (
                                <TableRow hover key={choice + i}>
                                    <MythicStyledTableCell style={{ width: '5rem' }}>
                                        <Button onClick={() => handleSubmit(choice)} variant="contained" color="primary">
                                            Select
                                        </Button>
                                    </MythicStyledTableCell>
                                    <MythicStyledTableCell>{choice}</MythicStyledTableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </div>
            <DialogActions>
                <Button onClick={props.onClose} variant="contained" color="primary">
                    Close
                </Button>
            </DialogActions>
        </>
    );
}
