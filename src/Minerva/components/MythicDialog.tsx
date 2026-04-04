// ═══════════════════════════════════════════════════════════════════
//  MythicDialog family — draggable dialog wrapper + utility dialogs
//  (Minerva-native – replaces old MythicComponents/MythicDialog)
//
//  Exports:
//    MythicDialog, MythicModifyStringDialog,
//    MythicViewJSONAsTableDialog, MythicViewObjectPropertiesAsTableDialog,
//    TableRowDateCell, TableRowSizeCell
// ═══════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, type ReactNode } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import WrapTextIcon from '@mui/icons-material/WrapText';
import Draggable from 'react-draggable';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-monokai';
import 'ace-builds/src-noconflict/ext-searchbox';
import { useTheme } from '@mui/material/styles';
import { toLocalTime } from '../lib/time';

// ── Draggable Dialog Title ────────────────────────────────────────
const MythicDraggableDialogTitle = ({ children }: { children: ReactNode }) => (
  <DialogTitle id="mythic-draggable-title" style={{ cursor: 'move', width: '100%' }}>
    {children}
  </DialogTitle>
);

// ── MythicDialog (draggable wrapper) ──────────────────────────────
interface MythicDialogProps {
  open: boolean;
  onClose: () => void;
  innerDialog: ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

export function MythicDialog(props: MythicDialogProps) {
  const [draggedState, setDraggedState] = React.useState({
    style: {} as React.CSSProperties,
    paperStyle: { margin: '0', height: 'fit-content', width: 'stretch' } as React.CSSProperties,
    containerStyle: {} as React.CSSProperties,
    hideBackdrop: false,
    modified: false,
  });
  const nodeRef = useRef<HTMLDivElement>(null!);
  const descriptionElementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (props.open) {
      descriptionElementRef.current?.focus();
    }
  }, [props.open]);

  const dialogOnClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.length > 0 && target.classList.contains('MuiDialog-container')) {
      props.onClose();
    }
  };

  const dialogOnContextMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleOnClose = (_event: any, reason: string) => {
    if (reason === 'backdropClick' && draggedState.hideBackdrop) return;
    props.onClose();
  };

  const onStart = (e: any) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!draggedState.modified) {
      setDraggedState({
        style: {
          height: e.target.offsetParent?.offsetHeight + 'px',
          width: e.target.offsetParent?.offsetWidth + 'px',
          margin: 'auto',
          overflowY: 'auto',
        },
        paperStyle: {
          width: e.target.offsetParent?.offsetWidth + 'px',
          margin: 0,
          overflowY: 'auto',
        },
        containerStyle: {
          height: 'fit-content',
          overflowY: 'auto',
        },
        hideBackdrop: true,
        modified: true,
      });
    }
  };

  const onStop = (e: any) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <Draggable
      nodeRef={nodeRef}
      handle="#mythic-draggable-title"
      cancel={'[class*="MuiDialogContent-root"]'}
      onStart={onStart}
      onStop={onStop}
    >
      <Dialog
        ref={nodeRef}
        open={props.open}
        onClick={dialogOnClick}
        onClose={handleOnClose}
        scroll="paper"
        maxWidth={props.maxWidth}
        fullWidth={props.fullWidth !== false}
        style={{ ...props.style, ...draggedState.style }}
        disableEnforceFocus
        disablePortal={false}
        hideBackdrop={draggedState.hideBackdrop}
        aria-labelledby="scroll-dialog-title"
        aria-describedby="scroll-dialog-description"
        sx={{
          '.MuiPaper-root': { ...draggedState.paperStyle },
          '.MuiDialog-container': { ...draggedState.containerStyle },
        }}
        onMouseDown={dialogOnClick}
        onContextMenu={dialogOnContextMenu}
      >
        {props.innerDialog}
      </Dialog>
    </Draggable>
  );
}

// ── MythicModifyStringDialog ──────────────────────────────────────
interface MythicModifyStringDialogProps {
  title: string;
  value: string;
  onClose?: () => void;
  onSubmit?: (value: string) => void;
  onSubmitText?: string;
  dontCloseOnSubmit?: boolean;
  wrap?: boolean;
  maxRows?: number;
}

export function MythicModifyStringDialog(props: MythicModifyStringDialogProps) {
  const [comment, setComment] = React.useState('');
  const [wrap, setWrap] = React.useState(props.wrap ?? false);
  const theme = useTheme();

  const onCommitSubmit = () => {
    props.onSubmit?.(comment);
    if (props.dontCloseOnSubmit) return;
    props.onClose?.();
  };

  useEffect(() => {
    try {
      setComment(JSON.stringify(JSON.parse(props.value), null, 2));
    } catch {
      setComment(props.value);
    }
  }, [props.value]);

  return (
    <>
      {props.title !== '' && (
        <MythicDraggableDialogTitle>
          {props.title}
          <span style={{ float: 'right' }} title={wrap ? 'Toggle off word wrap' : 'Toggle on word wrap'}>
            <IconButton onClick={() => setWrap(!wrap)}>
              <WrapTextIcon color={wrap ? 'success' : 'secondary'} />
            </IconButton>
          </span>
        </MythicDraggableDialogTitle>
      )}
      <DialogContent dividers style={{ margin: 0, padding: 0 }}>
        <AceEditor
          mode="json"
          theme={theme.palette.mode === 'dark' ? 'monokai' : 'github'}
          width="100%"
          fontSize={14}
          showPrintMargin={false}
          wrapEnabled={wrap}
          value={comment}
          focus
          onChange={setComment}
          setOptions={{ tabSize: 4, useWorker: false, showInvisibles: false }}
        />
      </DialogContent>
      {(props.onClose || props.onSubmit) && (
        <DialogActions>
          {props.onClose && (
            <Button onClick={props.onClose} variant="contained" color="primary">
              Close
            </Button>
          )}
          {props.onSubmit && (
            <Button onClick={onCommitSubmit} variant="contained" color="success">
              {props.onSubmitText ?? 'Submit'}
            </Button>
          )}
        </DialogActions>
      )}
    </>
  );
}

// ── Value conversion helpers ──────────────────────────────────────
const convertValueToContextValue = (key: string, value: any, me?: any): any => {
  if (key.includes('time')) {
    try {
      return TableRowDateCell({ cellData: value, view_utc_time: me?.user?.view_utc_time });
    } catch {
      return value;
    }
  } else if (key.includes('size')) {
    try {
      return TableRowSizeCell({ cellData: value });
    } catch {
      return value;
    }
  } else if (value !== null && typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  } else if (value === true) {
    return 'True';
  } else if (value === false) {
    return 'False';
  }
  return value;
};

// ── TableRowDateCell ──────────────────────────────────────────────
export const TableRowDateCell = ({
  cellData,
  rowData,
  view_utc_time = true,
}: {
  cellData: any;
  rowData?: any;
  view_utc_time?: boolean;
}): string => {
  try {
    const cellDataInt = parseInt(cellData, 10);
    if (cellData === '' || cellData === undefined || cellDataInt <= 0) return '';
    const view_utc = view_utc_time ?? true;
    if (view_utc) {
      const d = new Date(cellDataInt);
      return d.toDateString() + ' ' + d.toTimeString().substring(0, 8) + ' UTC';
    } else {
      const tz = new Date(cellDataInt);
      tz.setTime(tz.getTime() - tz.getTimezoneOffset() * 60 * 1000);
      return tz.toLocaleDateString() + ' ' + tz.toLocaleString([], { hour12: true, hour: '2-digit', minute: '2-digit' });
    }
  } catch {
    try {
      const cellDataInt = parseInt(cellData, 10);
      const dateData = new Date(((cellDataInt / 10_000_000) - 11_644_473_600) * 1000).toISOString();
      return toLocalTime(dateData.slice(0, 10) + ' ' + dateData.slice(11, -1), view_utc_time);
    } catch {
      return String(cellData);
    }
  }
};

// ── TableRowSizeCell ──────────────────────────────────────────────
export const TableRowSizeCell = ({
  cellData,
  rowData,
}: {
  cellData: any;
  rowData?: any;
}): string => {
  try {
    const bytes = parseInt(cellData, 10);
    if (cellData === '' || cellData === undefined) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  } catch {
    return String(cellData);
  }
};

// ── MythicViewJSONAsTableDialog ───────────────────────────────────
interface MythicViewJSONAsTableDialogProps {
  title: string;
  value: any;
  leftColumn: string;
  rightColumn: string;
  onClose: () => void;
  me?: any;
}

export function MythicViewJSONAsTableDialog(props: MythicViewJSONAsTableDialogProps) {
  const [comment, setComment] = React.useState<any[]>([]);
  const [tableType, setTableType] = React.useState('dictionary');
  const [headers, setHeaders] = React.useState<string[]>([]);

  useEffect(() => {
    let permissions: any[] = [];
    try {
      let permissionDict: any;
      if (props.value?.constructor === Object) {
        permissionDict = props.value;
      } else {
        permissionDict = JSON.parse(props.value);
      }
      if (!Array.isArray(permissionDict) && typeof permissionDict !== 'string') {
        for (const key in permissionDict) {
          if (permissionDict[key]?.constructor === Object) {
            permissions.push({ name: key, value: permissionDict[key], new_table: true, is_dictionary: true, headers: ['Name', 'Value'] });
          } else if (Array.isArray(permissionDict[key])) {
            if (permissionDict[key].length === 1) {
              if (permissionDict[key][0]?.constructor === Object) {
                permissions.push({ name: key, value: permissionDict[key][0], new_table: true, is_dictionary: true, headers: ['Name', 'Value'] });
              } else {
                permissions.push({ name: key, value: JSON.stringify(permissionDict[key], null, 2) });
              }
            } else if (permissionDict[key].length > 1) {
              if (permissionDict[key][0]?.constructor === Object) {
                const newHeaders: string[] = [];
                for (const item of permissionDict[key]) {
                  for (const newKey in item) {
                    if (!newHeaders.includes(newKey)) newHeaders.push(newKey);
                  }
                }
                newHeaders.sort();
                permissions.push({ name: key, value: permissionDict[key], new_table: true, is_array: true, headers: newHeaders });
              } else {
                permissions.push({ name: key, value: JSON.stringify(permissionDict[key], null, 2) });
              }
            } else {
              permissions.push({ name: key, value: JSON.stringify(permissionDict[key], null, 2) });
            }
          } else if (permissionDict[key] !== undefined && permissionDict[key] !== null) {
            permissions.push({ name: key, value: permissionDict[key] });
          }
          setHeaders([props.leftColumn, props.rightColumn]);
        }
      } else if (Array.isArray(permissionDict)) {
        setTableType('array');
        if (permissionDict.length > 0) {
          setHeaders(Object.keys(permissionDict[0]));
          permissions = [...permissionDict];
        }
      }
    } catch (error) {
      console.error(error);
    }
    setComment(permissions);
  }, [props.value, props.leftColumn, props.rightColumn]);

  return (
    <>
      <MythicDraggableDialogTitle>
        <span style={{ wordBreak: 'break-all', maxWidth: '100%' }}>{props.title}</span>
      </MythicDraggableDialogTitle>
      <TableContainer className="mythicElement" style={{ paddingLeft: '10px' }}>
        <Table size="small" style={{ tableLayout: 'fixed', maxWidth: 'calc(100vw)', overflow: 'scroll' }}>
          <TableHead>
            <TableRow>
              {headers.map((header, index) => (
                <TableCell key={'header' + index} style={index === 0 ? { width: '15%', wordBreak: 'break-all' } : { wordBreak: 'break-all' }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {tableType === 'dictionary'
              ? comment.map((element, index) => (
                <TableRow key={'row' + index} hover>
                  <TableCell style={{ wordBreak: 'break-all' }}>{element.name}</TableCell>
                  {element.new_table ? (
                    <TableContainer className="mythicElement">
                      <Table size="small" style={{ tableLayout: 'fixed', maxWidth: 'calc(100vw)', overflow: 'scroll' }}>
                        <TableHead>
                          <TableRow>
                            {element.headers.map((header: string, hIdx: number) => (
                              <TableCell key={'eheader' + header + hIdx} style={hIdx === 0 ? { width: '15%', wordBreak: 'break-all' } : { wordBreak: 'break-all' }}>
                                {header}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {element.is_dictionary
                            ? Object.keys(element.value).map((key: string, dIdx: number) => (
                              <TableRow key={'element' + dIdx + 'dict'}>
                                <TableCell style={{ width: '30%', wordBreak: 'break-all' }}>{key}</TableCell>
                                <TableCell style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                                  {convertValueToContextValue(key, element.value[key], props.me)}
                                </TableCell>
                              </TableRow>
                            ))
                            : element.value.map((e: any, eIdx: number) => (
                              <TableRow key={'arr' + eIdx}>
                                {element.headers.map((header: string, hIdx: number) => (
                                  <TableCell key={'arr' + eIdx + 'h' + hIdx} style={hIdx === 0 ? { width: '15%', wordBreak: 'break-all' } : { wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                                    {convertValueToContextValue(header, e[header], props.me)}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <TableCell style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                      {convertValueToContextValue(element.name, element.value, props.me)}
                    </TableCell>
                  )}
                </TableRow>
              ))
              : comment.map((row, index) => (
                <TableRow key={'row' + index} hover>
                  {Object.keys(row).map((key) => (
                    <TableCell key={'row' + index + 'cell' + key} style={{ wordBreak: 'break-all' }}>
                      {convertValueToContextValue(key, row[key], props.me)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      <DialogActions>
        <Button onClick={props.onClose} variant="contained" color="primary">
          Close
        </Button>
      </DialogActions>
    </>
  );
}

// ── MythicViewObjectPropertiesAsTableDialog ────────────────────────
interface MythicViewObjectPropertiesAsTableDialogProps {
  title: string;
  value: Record<string, any>;
  keys: string[];
  leftColumn: string;
  rightColumn: string;
  onClose: () => void;
}

export function MythicViewObjectPropertiesAsTableDialog(props: MythicViewObjectPropertiesAsTableDialogProps) {
  const [comment, setComment] = React.useState<Array<{ name: string; value: any }>>([]);

  useEffect(() => {
    const permissions = props.keys.reduce<Array<{ name: string; value: any }>>((prev, key) => {
      if (props.value[key] !== undefined && props.value[key] !== null && props.value[key] !== '') {
        return [...prev, { name: key, value: props.value[key] }];
      }
      return prev;
    }, []);
    setComment(permissions);
  }, [props.value, props.keys]);

  return (
    <>
      <DialogTitle>{props.title}</DialogTitle>
      <DialogContent dividers>
        <Paper elevation={5} variant="elevation" style={{ position: 'relative' }}>
          <TableContainer component={Paper} className="mythicElement">
            <Table size="small" style={{ tableLayout: 'fixed', maxWidth: 'calc(100vw)', overflow: 'scroll' }}>
              <TableHead>
                <TableRow>
                  <TableCell>{props.leftColumn}</TableCell>
                  <TableCell>{props.rightColumn}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {comment.map((element, index) => (
                  <TableRow key={'row' + index}>
                    <TableCell style={{ wordBreak: 'break-all' }}>{element.name}</TableCell>
                    <TableCell style={{ wordBreak: 'break-all' }}>
                      {convertValueToContextValue(element.name, element.value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} variant="contained" color="primary">
          Close
        </Button>
      </DialogActions>
    </>
  );
}
