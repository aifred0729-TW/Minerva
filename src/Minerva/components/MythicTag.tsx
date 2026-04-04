// ═══════════════════════════════════════════════════════════════════
//  MythicTag — tag display, view, edit, and create components
//  (Minerva-native — replaces old MythicComponents/MythicTag)
// ═══════════════════════════════════════════════════════════════════
import React from 'react';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MythicTextField from './MythicTextField';
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { useQueryCompat as useQuery } from "../lib/useQueryCompat";
import { Select, Input, MenuItem, Link, IconButton } from '@mui/material';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-monokai';
import 'ace-builds/src-noconflict/theme-xcode';
import { useTheme } from '@mui/material/styles';
import { snackActions } from '../lib/snackbar';
import { MythicDialog } from './MythicDialog';
import { MythicConfirmDialog } from './MythicConfirmDialog';
import DeleteIcon from '@mui/icons-material/Delete';
import WebhookIcon from '@mui/icons-material/Webhook';
import Chip from '@mui/material/Chip';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import { MythicStyledTooltip } from './MythicStyledTooltip';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import Typography from '@mui/material/Typography';
import MythicStyledTableCell from './MythicTableCell';
import { useReactiveVar } from "@apollo/client/react";
import { meState } from '../lib/state';

// ── GQL definitions ───────────────────────────────────────────────
const createNewTagMutationTemplate = ({ target_object }: { target_object: string }) => {
  return gql`
    mutation createNewTag($url: String!, $data: jsonb!, $source: String!, $${target_object}: Int!, $tagtype_id: Int!){
        createTag(url: $url, data: $data, source: $source, ${target_object}: $${target_object}, tagtype_id: $tagtype_id){
            id
            status
            error
        }
    }
    `;
};

const updateTagMutationTemplate = gql`
    mutation updateNewTag($url: String!, $data: jsonb!, $source: String!, $tag_id: Int!) {
        update_tag_by_pk(pk_columns: { id: $tag_id }, _set: { url: $url, source: $source, data: $data }) {
            id
        }
    }
`;

const getObjectTagsQueryTemplate = ({ target_object }: { target_object: string }) => {
  return gql`
    query getObjectTags ($${target_object}: Int!) {
        tag(where: {${target_object}: {_eq: $${target_object}}}, order_by: {tagtype: {name: asc}}) {
            source
            url
            id
            data
            tagtype {
                name
                description
                color
                id
            }
        }
    }
    `;
};

const getTagtypesQuery = gql`
    query getTagtype {
        tagtype(order_by: { name: asc }) {
            name
            color
            description
            id
        }
    }
`;

export const deleteTagMutation = gql`
    mutation deleteTag($tag_id: Int!) {
        delete_tag_by_pk(id: $tag_id) {
            id
        }
    }
`;

const getSingleTag = gql`
    query getSingleTag($tag_id: Int!) {
        tag_by_pk(id: $tag_id) {
            source
            url
            id
            data
            apitokens_id
            credential_id
            filemeta_id
            keylog_id
            mythictree_id
            operation_id
            response_id
            callback_id
            payload_id
            task_id
            taskartifact_id
            tagtype {
                name
                description
                color
                id
            }
        }
    }
`;

// ── TagsDisplay ───────────────────────────────────────────────────
export const TagsDisplay = ({ tags, expand }: { tags: any[]; expand?: boolean }) => {
  return tags?.map((tt: any) => <TagChipDisplay tag={tt} key={tt.id} expand={expand} />);
};

const TagChipDisplay = ({ tag, expand }: { tag: any; expand?: boolean }) => {
  const [openTagDisplay, setOpenTagDisplay] = React.useState(false);
  const [label, setLabel] = React.useState(expand ? tag.tagtype.name : tag.tagtype.name[0]);
  const collapseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, []);

  const onSelectTag = (event: any) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setOpenTagDisplay(true);
  };

  const onClose = (event?: any) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setOpenTagDisplay(false);
  };

  const onMouseOver = () => {
    if (expand === undefined || !expand) {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      setLabel(tag.tagtype.name);
    }
  };

  const onMouseOut = () => {
    if (expand === undefined || !expand) {
      collapseTimerRef.current = setTimeout(() => {
        setLabel(tag.tagtype.name[0]);
      }, 10000);
    }
  };

  return (
    <React.Fragment>
      <Chip
        onMouseOver={onMouseOver}
        onMouseOut={onMouseOut}
        label={label}
        size="small"
        onClick={onSelectTag}
        style={{ float: 'right', backgroundColor: tag.tagtype.color, height: '15px' }}
        sx={{ '& .MuiChip-label': { overflow: 'visible' } }}
      />
      {openTagDisplay && (
        <MythicDialog
          fullWidth
          maxWidth="xl"
          open={openTagDisplay}
          onClose={onClose}
          innerDialog={<ViewTagDialog onClose={onClose} target_object_id={tag.id} />}
        />
      )}
    </React.Fragment>
  );
};

// ── StringTagDataEntry ────────────────────────────────────────────
const StringTagDataEntry = ({ name, value }: { name: string; value: string }) => {
  const regex = '^\\[.*\\]\\(.*\\)';
  const captureRegex = '^\\[(?<display>.*)\\]\\((?<url>.*)\\)(?<other>.*)';
  const targetRegex = ":target=[\"'](?<target>.*?)[\"']";
  const colorRegex = ":color=[\"'](?<color>.*?)[\"']";

  const onClick = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    fetch(url)
      .then((response) => {
        if (response.status !== 200) {
          snackActions.warning('HTTP ' + response.status + ' response');
        } else {
          snackActions.success('Successfully contacted url');
        }
      })
      .catch((error) => {
        if (error.toString() === 'TypeError: Failed to fetch') {
          snackActions.warning('Failed to make connection - this could be networking issues or ssl certs that need to be accepted first');
        } else {
          snackActions.warning('Error talking to server: ' + error.toString());
        }
      });
  };

  if (RegExp(regex)?.test(value)) {
    const capturePieces = RegExp(captureRegex).exec(value);
    if (!capturePieces) return <>{value}</>;
    const targetPieces = RegExp(targetRegex).exec(capturePieces[3]);
    const colorPieces = RegExp(colorRegex).exec(capturePieces[3]);
    if (targetPieces && targetPieces.groups?.target === 'api') {
      let color: any = 'textPrimary';
      if (colorPieces?.groups?.color) {
        color = colorPieces.groups.color;
      }
      return (
        <MythicStyledTooltip title="Make API Request">
          <WebhookIcon
            style={{ cursor: 'pointer', marginRight: '10px' }}
            onClick={(e) => onClick(e, capturePieces[2])}
            color={color}
          />
          {capturePieces[1]}
        </MythicStyledTooltip>
      );
    }
    const href = /^https?:\/\//.test(capturePieces[2]) || capturePieces[2].startsWith('/') ? capturePieces[2] : '#';
    return (
      <Link href={href} color="textPrimary" target="_blank" rel="noopener noreferrer">
        {capturePieces[1]}
      </Link>
    );
  } else if (value.startsWith('http:') || value.startsWith('https:')) {
    return (
      <>
        {'Click for: '}
        <Link href={value} color="textPrimary" target="_blank" rel="noopener noreferrer">
          {name}
        </Link>
      </>
    );
  }
  return <>{value}</>;
};

// ── ViewTagDialog ─────────────────────────────────────────────────
function ViewTagDialog(props: { target_object_id: number; onClose: (event?: any) => void; me?: any }) {
  const theme = useTheme();
  const [selectedTag, setSelectedTag] = React.useState<any>({});
  const [objectInfo, setObjectInfo] = React.useState({ object_type: '', object_id: '' });

  useQuery<any>(getSingleTag, {
    variables: { tag_id: props.target_object_id },
    onCompleted: (data: any) => {
      const tagData = data.tag_by_pk;
      const objectFields = [
        'apitokens_id', 'credential_id', 'filemeta_id', 'keylog_id',
        'mythictree_id', 'response_id', 'task_id', 'taskartifact_id',
        'payload_id', 'callback_id',
      ];
      for (const field of objectFields) {
        if (tagData[field] !== null) {
          setObjectInfo({ object_type: field, object_id: tagData[field] });
          break;
        }
      }
      let newTag = { ...tagData };
      try {
        if (newTag.data?.constructor === Object) {
          newTag.data = { ...tagData.data };
          newTag.is_json = true;
        } else if (typeof newTag.data === 'string') {
          newTag.data = JSON.parse(newTag.data);
          newTag.is_json = true;
        }
      } catch {
        newTag.is_json = false;
      }
      setSelectedTag(newTag);
    },
    fetchPolicy: 'network-only',
  });

  const onClose = (event?: any) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    props.onClose(event);
  };

  const stopClicks = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <>
      <DialogTitle id="form-dialog-title" onClick={stopClicks}>View Tag</DialogTitle>
      <TableContainer className="mythicElement" onClick={stopClicks}>
        <Table size="small" style={{ maxWidth: '100%', overflow: 'scroll' }}>
          <TableBody>
            <TableRow hover>
              <TableCell style={{ width: '20%' }}>Tag Type</TableCell>
              <TableCell style={{ display: 'inline-flex', flexDirection: 'row', width: '100%' }}>
                <Chip label={selectedTag?.tagtype?.name || ''} size="small" style={{ float: 'right', backgroundColor: selectedTag?.tagtype?.color || '' }} />
                <ViewEditTags target_object={objectInfo.object_type} target_object_id={objectInfo.object_id} />
              </TableCell>
            </TableRow>
            <TableRow hover>
              <TableCell>Description</TableCell>
              <TableCell>{selectedTag?.tagtype?.description || ''}</TableCell>
            </TableRow>
            <TableRow hover>
              <MythicStyledTableCell>Source</MythicStyledTableCell>
              <MythicStyledTableCell>{selectedTag?.source || ''}</MythicStyledTableCell>
            </TableRow>
            <TableRow hover>
              <MythicStyledTableCell>Reference URL</MythicStyledTableCell>
              <MythicStyledTableCell>
                {selectedTag?.url === '' ? 'No reference link provided' : (
                  <Link href={selectedTag?.url || '#'} color="textPrimary" target="_blank" rel="noopener noreferrer">
                    {selectedTag?.url ? 'click here' : 'No reference link provided'}
                  </Link>
                )}
              </MythicStyledTableCell>
            </TableRow>
            <TableRow>
              <TableCell>Data</TableCell>
              <TableCell>
                {selectedTag?.is_json ? (
                  <TableContainer className="mythicElement">
                    <Table size="small" style={{ maxWidth: '100%', overflow: 'scroll' }}>
                      <TableBody>
                        {Object.keys(selectedTag.data || {}).map((key: string) => (
                          <TableRow key={key} hover>
                            <MythicStyledTableCell>{key}</MythicStyledTableCell>
                            {typeof selectedTag.data[key] === 'string' ? (
                              <MythicStyledTableCell style={{ whiteSpace: 'pre-wrap' }}>
                                <StringTagDataEntry name={key} value={String(selectedTag.data[key])} />
                              </MythicStyledTableCell>
                            ) : typeof selectedTag.data[key] === 'object' ? (
                              Array.isArray(selectedTag.data[key]) ? (
                                <TableCell style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(selectedTag.data[key], null, 2)}</TableCell>
                              ) : (
                                <MythicStyledTableCell>
                                  <Table size="small">
                                    <TableBody>
                                      {Object.keys(selectedTag.data[key]).map((key2: string) => (
                                        <TableRow key={key2}>
                                          <MythicStyledTableCell>{key2}</MythicStyledTableCell>
                                          <MythicStyledTableCell>
                                            <StringTagDataEntry name={key2} value={String(selectedTag.data[key][key2])} />
                                          </MythicStyledTableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </MythicStyledTableCell>
                              )
                            ) : typeof selectedTag.data[key] === 'boolean' ? (
                              <MythicStyledTableCell>{selectedTag.data[key] ? 'True' : 'False'}</MythicStyledTableCell>
                            ) : (
                              <MythicStyledTableCell>{String(selectedTag.data[key])}</MythicStyledTableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <AceEditor
                    mode="json"
                    theme={theme.palette.mode === 'dark' ? 'monokai' : 'xcode'}
                    fontSize={14}
                    showGutter
                    maxLines={20}
                    highlightActiveLine={false}
                    value={selectedTag?.data || ''}
                    width="100%"
                    setOptions={{ showLineNumbers: true, tabSize: 4, useWorker: false, wrapBehavioursEnabled: true, wrap: true }}
                  />
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
      <DialogActions onClick={(e) => e.stopPropagation()}>
        <Button onClick={onClose} variant="contained" color="primary">Close</Button>
      </DialogActions>
    </>
  );
}

// ── ViewEditTagsDialog ────────────────────────────────────────────
export function ViewEditTagsDialog(props: { target_object: string; target_object_id: any; me?: any; onClose: () => void; onSubmit?: (args: any) => void }) {
  const theme = useTheme();
  const [newSource, setNewSource] = React.useState('');
  const [newURL, setNewURL] = React.useState('');
  const [newData, setNewData] = React.useState('');
  const [selectedTag, setSelectedTag] = React.useState<any>('');
  const [existingTags, setExistingTags] = React.useState<any[]>([]);
  const [openNewDialog, setOpenNewDialog] = React.useState(false);
  const [openDelete, setOpenDeleteDialog] = React.useState(false);

  useQuery<any>(getObjectTagsQueryTemplate({ target_object: props.target_object }), {
    variables: { [props.target_object]: props.target_object_id },
    onCompleted: (data: any) => {
      setExistingTags(data.tag);
      if (data.tag.length > 0) {
        setSelectedTag(data.tag[0]);
        setNewSource(data.tag[0].source);
        setNewURL(data.tag[0].url);
        try {
          setNewData(typeof data.tag[0].data !== 'string' ? JSON.stringify(data.tag[0].data, null, 2) : String(data.tag[0].data));
        } catch {
          setNewData(String(data.tag[0].data));
        }
      }
    },
    fetchPolicy: 'network-only',
  });

  const [deleteTag] = useMutation<any>(deleteTagMutation, {
    onCompleted: (data: any) => {
      snackActions.success('Successfully deleted tag');
      const newTags = existingTags.filter((c) => c.id !== data.delete_tag_by_pk.id);
      setExistingTags(newTags);
      if (newTags.length > 0) {
        setSelectedTag(newTags[0]);
        try { setNewData(JSON.stringify(newTags[0].data, null, 2)); } catch { setNewData(String(newTags[0].data)); }
        setNewSource(newTags[0].source);
        setNewURL(newTags[0].url);
      } else {
        setSelectedTag('');
        setNewData('');
        setNewSource('');
        setNewURL('');
      }
    },
    onError: (error) => snackActions.error('Failed to delete tag: ' + error.message),
  });

  const [updateTag] = useMutation<any>(updateTagMutationTemplate, {
    onCompleted: () => { snackActions.success('Successfully updated tag'); props.onClose(); },
    onError: (error) => snackActions.error('Failed to update: ' + error.message),
  });

  const onSubmit = () => {
    updateTag({ variables: { tag_id: selectedTag.id, source: newSource, url: newURL, data: newData } });
    props.onSubmit?.({ source: newSource, url: newURL, data: newData, tag_id: selectedTag.id });
  };

  const handleTaskTypeChange = (evt: any) => {
    setSelectedTag(evt.target.value);
    setNewSource(evt.target.value.source);
    setNewURL(evt.target.value.url);
    try { setNewData(JSON.stringify(evt.target.value.data, null, 2)); } catch { setNewData(String(evt.target.value.data)); }
  };

  const handleNewTagCreate = () => { props.onClose(); };
  const onAcceptDelete = () => { deleteTag({ variables: { tag_id: selectedTag.id } }); setOpenDeleteDialog(false); };

  return (
    <>
      <DialogTitle id="mythic-draggable-title" style={{ cursor: 'move', width: '100%' }}>Edit Tags</DialogTitle>
      <DialogContent dividers style={{ width: '100%' }}>
        {openNewDialog && (
          <MythicDialog fullWidth maxWidth="lg" open={openNewDialog}
            onClose={() => setOpenNewDialog(false)}
            innerDialog={<NewTagDialog me={props.me} target_object={props.target_object} target_object_id={props.target_object_id} onClose={() => setOpenNewDialog(false)} onSubmit={handleNewTagCreate} />}
          />
        )}
        <Table size="small" style={{ width: '100%', overflow: 'scroll' }}>
          <TableBody>
            <TableRow hover>
              <MythicStyledTableCell style={{ width: '30%' }}>Select Existing Tag to Edit or Add New</MythicStyledTableCell>
              <MythicStyledTableCell style={{ display: 'inline-flex', flexDirection: 'row-reverse' }}>
                <MythicStyledTooltip title="Add New Tag">
                  <IconButton color="success" style={{ float: 'right' }} onClick={() => setOpenNewDialog(true)}>
                    <AddCircleOutlineIcon />
                  </IconButton>
                </MythicStyledTooltip>
                <Select value={selectedTag} onChange={handleTaskTypeChange} input={<Input />}>
                  {existingTags.map((opt) => (
                    <MenuItem value={opt} key={opt.id}>
                      <Chip label={opt.tagtype.name} size="small" style={{ float: 'right', backgroundColor: opt.tagtype.color }} />
                    </MenuItem>
                  ))}
                </Select>
                {selectedTag.id && (
                  <IconButton size="small" style={{ float: 'right' }} onClick={() => setOpenDeleteDialog(true)} color="error"><DeleteIcon /></IconButton>
                )}
                {openDelete && <MythicConfirmDialog onClose={() => setOpenDeleteDialog(false)} onSubmit={onAcceptDelete} open={openDelete} />}
              </MythicStyledTableCell>
            </TableRow>
            <TableRow hover>
              <MythicStyledTableCell>Tag Description</MythicStyledTableCell>
              <MythicStyledTableCell>{selectedTag?.tagtype?.description || ''}</MythicStyledTableCell>
            </TableRow>
            <TableRow hover>
              <MythicStyledTableCell>Source</MythicStyledTableCell>
              <MythicStyledTableCell>
                <MythicTextField value={newSource} onChange={(_, v) => setNewSource(v)} name="Source of tag data" />
              </MythicStyledTableCell>
            </TableRow>
            <TableRow hover>
              <MythicStyledTableCell>External URL</MythicStyledTableCell>
              <MythicStyledTableCell>
                <MythicTextField value={newURL} onChange={(_, v) => setNewURL(v)} name="External URL reference" />
                <Link href={newURL} color="textPrimary" target="_blank" rel="noopener noreferrer">{newURL ? 'click here' : ''}</Link>
              </MythicStyledTableCell>
            </TableRow>
            <TableRow hover>
              <MythicStyledTableCell>JSON Data</MythicStyledTableCell>
              <MythicStyledTableCell>
                <AceEditor mode="json" theme={theme.palette.mode === 'dark' ? 'monokai' : 'xcode'} onChange={setNewData} fontSize={14} showGutter maxLines={20} highlightActiveLine value={newData} width="100%" setOptions={{ showLineNumbers: true, tabSize: 4, useWorker: false }} />
              </MythicStyledTableCell>
            </TableRow>
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} variant="contained" color="primary">Close</Button>
        {selectedTag.id && <Button onClick={onSubmit} variant="contained" color="success">Submit</Button>}
      </DialogActions>
    </>
  );
}

// ── NewTagDialog ──────────────────────────────────────────────────
export function NewTagDialog(props: { target_object: string; target_object_id: any; me?: any; onClose: () => void; onSubmit: (args: any) => void }) {
  const theme = useTheme();
  const [newSource, setNewSource] = React.useState('');
  const [newURL, setNewURL] = React.useState('');
  const [newData, setNewData] = React.useState('');
  const [selectedTagType, setSelectedTagType] = React.useState<any>('');
  const [existingTagTypes, setExistingTagTypes] = React.useState<any[]>([]);

  useQuery<any>(getTagtypesQuery, {
    onCompleted: (data: any) => {
      setExistingTagTypes(data.tagtype);
      if (data.tagtype.length > 0) setSelectedTagType(data.tagtype[0]);
    },
    fetchPolicy: 'network-only',
  });

  const [newTag] = useMutation<any>(createNewTagMutationTemplate({ target_object: props.target_object }), {
    onCompleted: (data: any) => {
      if (data.createTag.status === 'success') {
        snackActions.success('Successfully created new tag!');
        props.onSubmit({ source: newSource, url: newURL, data: newData, tagtype_id: selectedTagType.id, id: data.createTag.id });
        props.onClose();
      } else {
        snackActions.error(data.createTag.error);
      }
    },
    onError: (error) => snackActions.error(error.message),
  });

  const onSubmit = () => {
    newTag({ variables: { source: newSource, url: newURL, data: newData, tagtype_id: selectedTagType.id, [props.target_object]: props.target_object_id } });
  };

  return (
    <>
      <DialogTitle id="mythic-draggable-title" style={{ cursor: 'move', width: '100%' }}>Add New Tag</DialogTitle>
      <DialogContent dividers style={{ width: '100%' }}>
        <Table size="small" style={{ overflow: 'scroll', width: '100%' }}>
          <TableBody>
            <TableRow hover>
              <MythicStyledTableCell style={{ width: '20%' }}>
                <Typography>Tag</Typography>
                <Typography component="span" style={{ fontSize: theme.typography.pxToRem(15) }}>
                  To create a new tag type click{' '}
                  <Link style={{ wordBreak: 'break-all' }} color="textPrimary" href="/new/tagtypes" underline="always" target="_blank">here</Link>
                </Typography>
              </MythicStyledTableCell>
              <MythicStyledTableCell>
                <Select value={selectedTagType} onChange={(evt) => setSelectedTagType(evt.target.value)} input={<Input style={{ width: '100%' }} />}>
                  {existingTagTypes.map((opt) => (
                    <MenuItem value={opt} key={opt.name}>
                      <Chip label={opt.name} size="small" style={{ backgroundColor: opt.color }} />
                    </MenuItem>
                  ))}
                </Select>
              </MythicStyledTableCell>
            </TableRow>
            <TableRow hover>
              <MythicStyledTableCell>Source</MythicStyledTableCell>
              <MythicStyledTableCell>
                <MythicTextField value={newSource} onChange={(_, v) => setNewSource(v)} name="Source of tag data" />
              </MythicStyledTableCell>
            </TableRow>
            <TableRow hover>
              <MythicStyledTableCell>External URL</MythicStyledTableCell>
              <MythicStyledTableCell>
                <MythicTextField value={newURL} onChange={(_, v) => setNewURL(v)} name="External URL reference" />
                <Link href={newURL} color="textPrimary" target="_blank" rel="noopener noreferrer">{newURL}</Link>
              </MythicStyledTableCell>
            </TableRow>
            <TableRow hover>
              <MythicStyledTableCell>JSON Data</MythicStyledTableCell>
              <MythicStyledTableCell>
                <AceEditor mode="json" theme={theme.palette.mode === 'dark' ? 'monokai' : 'xcode'} onChange={setNewData} fontSize={14} showGutter maxLines={20} highlightActiveLine value={newData} width="100%" setOptions={{ showLineNumbers: true, tabSize: 4, useWorker: false }} />
              </MythicStyledTableCell>
            </TableRow>
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} variant="contained" color="primary">Close</Button>
        {selectedTagType !== '' && <Button onClick={onSubmit} variant="contained" color="success">Submit</Button>}
      </DialogActions>
    </>
  );
}

// ── ViewEditTags (icon button + dialog) ───────────────────────────
export const ViewEditTags = ({ target_object, target_object_id }: { target_object: string; target_object_id: any }) => {
  const me = useReactiveVar(meState);
  const [openTagDialog, setOpenTagDialog] = React.useState(false);

  const toggleTagDialog = (event: any, open: boolean) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setOpenTagDialog(open);
  };

  return (
    <>
      <IconButton onClick={(e) => toggleTagDialog(e, true)} size="small" style={{ display: 'inline-block', float: 'right', padding: '0px' }}>
        <LocalOfferOutlinedIcon />
      </IconButton>
      {openTagDialog && (
        <MythicDialog fullWidth maxWidth="xl" open={openTagDialog}
          onClose={() => toggleTagDialog(null, false)}
          innerDialog={<ViewEditTagsDialog me={me} target_object={target_object} target_object_id={target_object_id} onClose={() => toggleTagDialog(null, false)} />}
        />
      )}
    </>
  );
};
