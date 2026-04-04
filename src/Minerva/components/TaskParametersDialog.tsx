// ═══════════════════════════════════════════════════════════════════
//  TaskParametersDialog — Minerva-native TypeScript port
//  (replaces Legacy Callbacks/TaskParametersDialog + DialogRow)
// ═══════════════════════════════════════════════════════════════════
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { useQueryCompat as useQuery, useLazyQueryCompat as useLazyQuery } from '../lib/useQueryCompat';
import { snackActions } from '../lib/snackbar';
import { b64DecodeUnicode } from '../lib/utils';
import { UploadTaskFile } from './MythicFileUpload';
import MythicTextField from './MythicTextField';
import { MythicStyledTooltip } from './MythicStyledTooltip';
import MythicStyledTableCell from './MythicTableCell';
import { MythicDialog } from './MythicDialog';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import FormControl from '@mui/material/FormControl';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import IconButton from '@mui/material/IconButton';
import Backdrop from '@mui/material/Backdrop';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import CancelIcon from '@mui/icons-material/Cancel';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudUploadTwoToneIcon from '@mui/icons-material/CloudUploadTwoTone';
import { useTheme } from '@mui/material/styles';

const CREDENTIAL_TEXT_MAX_DISPLAY_LEN = 40;

// ── GraphQL ───────────────────────────────────────────────────────

const GetLoadedCommandsQuery = gql`
  query GetLoadedCommandsQuery($callback_id: Int!) {
    loadedcommands(where: { callback_id: { _eq: $callback_id } }) {
      id
      command { cmd attributes id }
    }
  }
`;
const getAllCommandsQuery = gql`
  query getAllCommandsQuery($payload_type_id: Int!) {
    command(where: { payload_type_id: { _eq: $payload_type_id }, deleted: { _eq: false } }) {
      attributes cmd id
    }
  }
`;
const getAllEdgesQuery = gql`
  query getAllEdgesQuery($callback_id: Int!) {
    callbackgraphedge(where: { _or: [{ source_id: { _eq: $callback_id } }, { destination_id: { _eq: $callback_id } }] }) {
      id
      c2profile { id name }
      destination {
        agent_callback_id host id display_id
        payload { id uuid }
        c2profileparametersinstances { enc_key_base64 dec_key_base64 value id c2_profile_id c2profileparameter { crypto_type name id } }
      }
      source {
        agent_callback_id host id display_id
        payload { uuid id }
        c2profileparametersinstances { enc_key_base64 dec_key_base64 c2_profile_id value id c2profileparameter { crypto_type name id } }
      }
      end_timestamp
    }
  }
`;
const getAllPayloadsQuery = gql`
  query getAllPayloadsQuery($operation_id: Int!) {
    payload(where: { deleted: { _eq: false }, build_phase: { _eq: "success" }, operation_id: { _eq: $operation_id } }, order_by: { id: desc }) {
      id description uuid
      payloadc2profiles { id c2profile { name id is_p2p } }
      payloadtype { id name }
      filemetum { id filename_text timestamp }
      buildparameterinstances { value id buildparameter { name parameter_type id } }
    }
  }
`;
const getAllPayloadsOnHostsQuery = gql`
  query getAllPayloadsOnHostsQuery($operation_id: Int!) {
    payloadonhost(where: { deleted: { _eq: false }, operation_id: { _eq: $operation_id }, payload: { c2profileparametersinstances: { c2profile: { is_p2p: { _eq: true } } } } }, order_by: { id: desc }) {
      host id
      payload {
        auto_generated id operation_id description
        filemetum { filename_text id }
        uuid
        c2profileparametersinstances(where: { c2profile: { is_p2p: { _eq: true } } }) {
          c2profile { name id }
          c2profileparameter { crypto_type name id }
          value enc_key_base64 dec_key_base64 id
        }
      }
    }
    callback(where: { active: { _eq: true }, operation_id: { _eq: $operation_id }, c2profileparametersinstances: { c2profile: { is_p2p: { _eq: true } } } }) {
      agent_callback_id host id display_id description crypto_type
      payload { auto_generated id description filemetum { filename_text id } uuid }
      c2profileparametersinstances(where: { c2profile: { is_p2p: { _eq: true } } }) {
        c2profile { name id }
        c2profileparameter { crypto_type name id }
        value enc_key_base64 dec_key_base64 id
      }
    }
  }
`;
const addPayloadOnHostMutation = gql`
  mutation addPayloadOnHostMutation($host: String!, $payload_id: Int!) {
    insert_payloadonhost_one(object: { host: $host, payload_id: $payload_id }) { id }
  }
`;
const removePayloadOnHostMutation = gql`
  mutation removePayloadOnHostMutation($payload_id: Int!, $host: String!, $operation_id: Int!) {
    update_payloadonhost(where: { host: { _eq: $host }, payload_id: { _eq: $payload_id }, operation_id: { _eq: $operation_id } }, _set: { deleted: true }) { affected_rows }
  }
`;
const getCommandQuery = gql`
  query getCommandQuery($id: Int!) {
    command_by_pk(id: $id) {
      attributes author cmd description help_cmd id needs_admin version
      payloadtype { name }
      commandparameters {
        choice_filter_by_command_attributes choices choices_are_all_commands choices_are_loaded_commands
        limit_credentials_by_type default_value description id name required
        supported_agent_build_parameters supported_agents type dynamic_query_function
        ui_position parameter_group_name display_name cli_name verifier_regex
      }
    }
  }
`;
const getCredentialsQuery = gql`
  query getCredentialsQuery($operation_id: Int!) {
    credential(where: { deleted: { _eq: false }, operation_id: { _eq: $operation_id } }, order_by: { id: desc }) {
      account comment credential_text id realm type
    }
  }
`;
const getDynamicQueryParams = gql`
  mutation getDynamicParamsMutation($callback: Int!, $command: String!, $payload_type: String!, $parameter_name: String!, $other_parameters: jsonb) {
    dynamic_query_function(callback: $callback, command: $command, payload_type: $payload_type, parameter_name: $parameter_name, other_parameters: $other_parameters) {
      status error choices parameter_name
    }
  }
`;
const parseTypedArrayMutation = gql`
  mutation parseTypedArrayMutation($callback: Int!, $command: String!, $payload_type: String!, $parameter_name: String!, $input_array: [String!]!) {
    typedarray_parse_function(callback: $callback, command: $command, payload_type: $payload_type, parameter_name: $parameter_name, input_array: $input_array) {
      status error typed_array
    }
  }
`;
const createCredentialMutation = gql`
  mutation createCredential($comment: String!, $account: String!, $realm: String!, $type: String!, $credential: String!) {
    createCredential(account: $account, credential: $credential, comment: $comment, realm: $realm, credential_type: $type) { id status error }
  }
`;
const getCredentialQuery = gql`
  query getCredential($id: Int!) {
    credential_by_pk(id: $id) { account comment credential_text id realm type task_id timestamp deleted operator { username } }
  }
`;
const updateCredentialDeletedMutation = gql`
  mutation updateAccountMutation($credential_id: Int!, $deleted: Boolean!) {
    update_credential_by_pk(pk_columns: { id: $credential_id }, _set: { deleted: $deleted }) { deleted id operator { username } }
  }
`;
const getFileInformationQuery = gql`
  query getFileInformation($file_id: String!) {
    filemeta(where: { agent_file_id: { _eq: $file_id } }) { filename_text agent_file_id }
  }
`;

// ── Types ─────────────────────────────────────────────────────────

interface CommandParam {
  choice_filter_by_command_attributes: any;
  choices: any[];
  choices_are_all_commands: boolean;
  choices_are_loaded_commands: boolean;
  limit_credentials_by_type: string[];
  default_value: string;
  description: string;
  id: number;
  name: string;
  required: boolean;
  supported_agent_build_parameters: any;
  supported_agents: string[];
  type: string;
  dynamic_query_function: string | null;
  ui_position: number;
  parameter_group_name: string;
  display_name: string;
  cli_name: string;
  verifier_regex: string;
}

interface ParamValue extends CommandParam {
  value: any;
  choices: any[];
  payload_choices?: any[];
  autoFocus?: boolean;
}

interface TaskParametersDialogProps {
  command: any;
  callback_id: number;
  payloadtype_id: number;
  operation_id: number;
  onSubmit: (cmd: string, params: string, files: string[], group: string, payloadType: string) => void;
  onClose: () => void;
}

interface RowProps extends ParamValue {
  onChange: (name: string, value: any, error: boolean) => void;
  onSubmit: () => void;
  commandInfo: any;
  parameterGroupName: string;
  callback_id: number;
  onAgentConnectAddNewPayloadOnHost: (host: string, payloadId: number) => void;
  onAgentConnectRemovePayloadOnHost: (args: { payload: any; host: string }) => void;
  addedCredential: (cred: any) => void;
  removedCredential: (cred: any) => void;
  setSubmenuOpenPreventTasking: (open: boolean) => void;
  getOtherParameters: () => Record<string, any>;
}

// ── Inline utility: MythicFileContext ─────────────────────────────

function MythicFileContext({ agent_file_id, extraStyles }: { agent_file_id: string; extraStyles?: React.CSSProperties }) {
  const [filename, setFilename] = useState(agent_file_id);
  const [getInfo] = useLazyQuery(getFileInformationQuery, {
    onCompleted: (data: any) => {
      if (data.filemeta.length > 0) {
        setFilename(b64DecodeUnicode(data.filemeta[0].filename_text));
      }
    },
  });
  useEffect(() => {
    getInfo({ variables: { file_id: agent_file_id } });
  }, [agent_file_id, getInfo]);
  return (
    <Link href={'/new/search?searchField=File&search=' + agent_file_id} target="_blank" style={extraStyles}>
      {filename}
    </Link>
  );
}

// ── Inline utility: CredentialNewDialog ───────────────────────────

function CredentialNewDialog({ onSubmit, onClose }: { onSubmit: (c: any) => void; onClose: () => void }) {
  const [credType, setCredType] = useState('plaintext');
  const [account, setAccount] = useState('');
  const [realm, setRealm] = useState('');
  const [credential, setCredential] = useState('');
  const [comment, setComment] = useState('');
  const types = ['plaintext', 'ticket', 'hash', 'certificate', 'key', 'hex'];
  const doSubmit = () => {
    onSubmit({ realm, account, comment, credential, type: credType });
    onClose();
  };
  return (
    <>
      <DialogTitle>Register New Credential</DialogTitle>
      <DialogContent dividers>
        <FormControl style={{ margin: 8, width: '100%' }}>
          <InputLabel>Which Type of Credential</InputLabel>
          <Select value={credType} onChange={(e) => setCredType(e.target.value as string)}>
            {types.map((t) => (
              <MenuItem key={t} value={t}><ListItemText primary={t} /></MenuItem>
            ))}
          </Select>
        </FormControl>
        <MythicTextField value={realm} onChange={(_n: string, v: string) => setRealm(v)} name="Realm or Domain" />
        <MythicTextField value={account} onChange={(_n: string, v: string) => setAccount(v)} name="Account Name" />
        <MythicTextField multiline value={credential} onChange={(_n: string, v: string) => setCredential(v)} name="Credential" />
        <MythicTextField value={comment} onChange={(_n: string, v: string) => setComment(v)} name="Comment" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">Close</Button>
        <Button onClick={doSubmit} color="success" variant="contained">Create</Button>
      </DialogActions>
    </>
  );
}

// ── Inline utility: DragAndDropFileUpload ─────────────────────────

function DragAndDropFileUpload({ value, values, multiple, onChange }: { value?: any; values?: any[]; multiple: boolean; onChange: (f: any) => void }) {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<any[]>(values ?? []);
  const [file, setFile] = useState<any>(value ?? { name: '' });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (value) setFile(value);
    if (values) setFiles(values);
  }, [value, values]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (multiple) { setFiles(droppedFiles); onChange(droppedFiles); }
    else { setFile(droppedFiles[0]); onChange(droppedFiles[0]); }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={() => setIsDragging(true)}
      onDragLeave={(e) => { if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setIsDragging(false); }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: isDragging ? `4px dashed ${theme.palette.success.main}` : `4px dashed ${theme.palette.primary.main}`,
        padding: '20px', textAlign: 'center', borderRadius: '10px', cursor: 'pointer',
      }}
    >
      <input ref={inputRef} onChange={(evt) => {
        if (multiple) { const f = [...(evt.target.files ?? [])]; setFiles(f); onChange(f); }
        else if (evt.target.files?.[0]) { setFile({ name: evt.target.files[0].name }); onChange(evt.target.files[0]); }
      }} type="file" hidden multiple={multiple} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {!multiple && file.name !== '' && (
          <>
            <CloudUploadTwoToneIcon fontSize="large" color="success" />
            <Typography>Selected:</Typography>
            <Typography>
              {!file.legacy && file.name}
              {file.legacy && <MythicFileContext agent_file_id={file.name} extraStyles={{ position: 'relative', marginLeft: '5px', marginRight: '5px' }} />}
            </Typography>
          </>
        )}
        {multiple && files.length > 0 && (
          <>
            <CloudUploadTwoToneIcon fontSize="large" color="success" />
            <Typography>Selected:</Typography>
            {files.map((f, i) => (
              <div key={i}>
                {typeof f === 'string' && <MythicFileContext agent_file_id={f} />}
                {typeof f !== 'string' && f.name}
              </div>
            ))}
          </>
        )}
        {file.name === '' && files.length === 0 && (
          <>
            <CloudUploadTwoToneIcon fontSize="large" color="success" />
            <Typography>Drag and drop files here</Typography>
            <Typography>Click to open dialog</Typography>
          </>
        )}
      </div>
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────

const arraysAreDifferent = (a: any[], b: any[]): boolean => {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return true; }
  return false;
};

export const commandInParsedParameters = (cmd: { name: string; cli_name: string; display_name: string }, parsedParameters: Record<string, any>): string | undefined => {
  if (cmd.name in parsedParameters) return cmd.name;
  if (cmd.cli_name in parsedParameters) return cmd.cli_name;
  if (cmd.display_name in parsedParameters) return cmd.display_name;
  return undefined;
};

// ── TaskParametersDialogRow ───────────────────────────────────────

function TaskParametersDialogRow(props: RowProps) {
  const [value, setValue] = useState<any>('');
  const theme = useTheme();
  const currentParameterGroup = useRef(props.parameterGroupName);
  const [ChoiceOptions, setChoiceOptions] = useState<any[]>([]);
  const [boolValue, setBoolValue] = useState(false);
  const [arrayValue, setArrayValue] = useState<string[]>([]);
  const [typedArrayValue, setTypedArrayValue] = useState<any[]>([]);
  const [chooseMultipleValue, setChooseMultipleValue] = useState<any[]>([]);
  const [chooseOneCustomValue, setChooseOneCustomValue] = useState('');
  const [agentConnectNewHost, setAgentConnectNewHost] = useState('');
  const [agentConnectHostOptions, setAgentConnectHostOptions] = useState<any[]>([]);
  const [agentConnectNewPayload, setAgentConnectNewPayload] = useState(0);
  const [agentConnectHost, setAgentConnectHost] = useState(0);
  const [agentConnectPayloadOptions, setAgentConnectPayloadOptions] = useState<any[]>([]);
  const [agentConnectPayload, setAgentConnectPayload] = useState(0);
  const [agentConnectC2ProfileOptions, setAgentConnectC2ProfileOptions] = useState<any[]>([]);
  const [agentConnectC2Profile, setAgentConnectC2Profile] = useState(0);
  const [openAdditionalPayloadOnHostMenu, setOpenAdditionalPayloadOnHostmenu] = useState(false);
  const [createCredentialDialogOpen, setCreateCredentialDialogOpen] = useState(false);
  const [fileValue, setFileValue] = useState<any>({ name: '' });
  const [fileMultValue, setFileMultValue] = useState<any[]>([]);
  const [backdropOpen, setBackdropOpen] = useState(false);
  const usingDynamicParamChoices = useRef(false);
  const usingDynamicParamComplexChoices = useRef(false);
  const usingParsedTypedArray = useRef(true);
  const updateToLatestCredential = useRef(false);
  const [treatNewlinesAsNewEntries, setTreatNewlinesAsNewEntries] = useState(false);
  const setAlarmAboutNoP2pRef = useRef(false);
  const locallySubmenuOpenPreventTaskingRef = useRef(false);

  const [getDynamicParamsFn] = useMutation(getDynamicQueryParams, {
    onCompleted: (data: any) => {
      if (data.dynamic_query_function.status === 'success') {
        try {
          let choicesInUse: any[] = [];
          if (data.dynamic_query_function.complex_choices?.length > 0) {
            usingDynamicParamComplexChoices.current = true;
            setChoiceOptions([...data.dynamic_query_function.complex_choices]);
            choicesInUse = [...data.dynamic_query_function.complex_choices];
          } else {
            usingDynamicParamComplexChoices.current = false;
            setChoiceOptions([...data.dynamic_query_function.choices]);
            choicesInUse = [...data.dynamic_query_function.choices];
          }
          usingDynamicParamChoices.current = true;
          if (props.type === 'ChooseOne') {
            if (choicesInUse.length > 0) {
              if (props.value !== '') {
                setValue(props.value); props.onChange(props.name, props.value, false);
              } else if (usingDynamicParamComplexChoices.current) {
                const vo = choicesInUse.map((c: any) => c.value);
                if (vo.includes(props.default_value)) { setValue(props.default_value); props.onChange(props.name, props.default_value, false); }
                else { setValue(choicesInUse[0].value); props.onChange(props.name, choicesInUse[0].value, false); }
              } else if (choicesInUse.includes(props.default_value)) {
                setValue(props.default_value); props.onChange(props.name, props.default_value, false);
              } else { setValue(choicesInUse[0]); props.onChange(props.name, choicesInUse[0], false); }
            }
          } else if (props.type === 'ChooseOneCustom') {
            let newStdVal = props.default_value;
            if (usingDynamicParamComplexChoices.current) {
              const vo = choicesInUse.map((c: any) => c.value);
              if (vo.includes(props.default_value)) setValue(props.default_value);
              else { setValue(choicesInUse[0].value); newStdVal = choicesInUse[0].value; }
            } else if (choicesInUse.includes(props.default_value) && props.value !== '') {
              setValue(props.default_value);
            } else { setValue(choicesInUse[0]); newStdVal = choicesInUse[0]; }
            if (!choicesInUse.includes(props.value) && props.value !== '') {
              setChooseOneCustomValue(props.value); newStdVal = props.value;
            }
            props.onChange(props.name, newStdVal, false);
          } else if (props.type === 'ChooseMultiple') {
            if (choicesInUse.length > 0) {
              if (props.value.length > 0) {
                setValue(props.value); setChooseMultipleValue(props.value); props.onChange(props.name, props.value, false);
              } else if (usingDynamicParamComplexChoices.current) {
                const vo = choicesInUse.map((c: any) => c.value);
                if (vo.includes(props.default_value)) {
                  setChooseMultipleValue([props.default_value]); setValue(props.default_value); props.onChange(props.name, [props.default_value], false);
                } else {
                  setChooseMultipleValue([choicesInUse[0].value]); setValue(choicesInUse[0].value); props.onChange(props.name, [choicesInUse[0].value], false);
                }
              } else if (choicesInUse.includes(props.default_value)) {
                setChooseMultipleValue([props.default_value]); props.onChange(props.name, [props.default_value], false);
              } else {
                setChooseMultipleValue([choicesInUse[0]]); setValue(choicesInUse[0].value); props.onChange(props.name, [choicesInUse[0]], false);
              }
            }
          }
        } catch {
          setBackdropOpen(false); snackActions.warning('Failed to parse dynamic parameter results');
          usingDynamicParamComplexChoices.current = false; setChoiceOptions([]); setValue('');
        }
      } else { snackActions.warning(data.dynamic_query_function.error); }
      setBackdropOpen(false);
    },
    onError: () => { snackActions.warning('Failed to perform dynamic parameter query'); setBackdropOpen(false); },
  });

  const [parseTypedArrayFn] = useMutation(parseTypedArrayMutation, {
    onCompleted: (data: any) => {
      if (data.typedarray_parse_function.status === 'success') {
        try {
          const newVal = data.typedarray_parse_function.typed_array.filter(Boolean);
          setTypedArrayValue(newVal); usingParsedTypedArray.current = true; props.onChange(props.name, newVal, false);
        } catch { setBackdropOpen(false); snackActions.warning('Failed to parse typed array function results'); setTypedArrayValue([]); }
      } else { snackActions.warning(data.typedarray_parse_function.error); }
      setBackdropOpen(false);
    },
    onError: () => { snackActions.warning('Failed to perform parse typed array function'); setBackdropOpen(false); },
  });

  const [getCredentialFn] = useLazyQuery(getCredentialQuery, {
    onCompleted: (data: any) => { updateToLatestCredential.current = true; props.addedCredential(data.credential_by_pk); },
    onError: (err: any) => console.error(err),
  });
  const [createCredentialFn] = useMutation(createCredentialMutation, {
    fetchPolicy: 'no-cache' as any,
    onCompleted: (data: any) => {
      snackActions.success('Successfully created new credential');
      if (data.createCredential.status === 'success') getCredentialFn({ variables: { id: data.createCredential.id } });
      else snackActions.error(data.createCredential.error);
    },
    onError: () => snackActions.error('Failed to create credential'),
  });
  const [deleteCredentialFn] = useMutation(updateCredentialDeletedMutation, {
    fetchPolicy: 'no-cache' as any,
    onCompleted: (data: any) => {
      snackActions.success('removed credential!');
      updateToLatestCredential.current = true; props.removedCredential(data.update_credential_by_pk);
    },
    onError: () => snackActions.error('Failed to delete credential'),
  });

  const reIssueDynamicQueryFunction = useCallback(() => {
    setBackdropOpen(true);
    snackActions.info('Querying payload type container for options...');
    getDynamicParamsFn({
      variables: {
        callback: props.callback_id, parameter_name: props.name,
        command: props.commandInfo.cmd, payload_type: props.commandInfo.payloadtype.name,
        other_parameters: props.getOtherParameters(),
      },
    });
    usingDynamicParamChoices.current = true;
  }, [getDynamicParamsFn, props]);

  const onChangeAgentConnect = useCallback((hostIdx: number, payloadIdx: number, c2Idx: number) => {
    const c2params = props.choices[hostIdx]['payloads'][payloadIdx]['c2info'][c2Idx].parameters.reduce(
      (prev: any, opt: any) => ({ ...prev, [opt.name]: opt.value }), {},
    );
    const val: any = {
      host: props.choices[hostIdx]['host'],
      agent_uuid: props.choices[hostIdx]['payloads'][payloadIdx].uuid,
      c2_profile: { name: props.choices[hostIdx]['payloads'][payloadIdx]['c2info'][c2Idx].name, parameters: c2params },
    };
    val.callback_uuid = props.choices[hostIdx]['payloads'][payloadIdx].type === 'callback'
      ? props.choices[hostIdx]['payloads'][payloadIdx]['agent_callback_id'] : '';
    props.onChange(props.name, val, false);
  }, [props]);

  // ── Main useEffect — sync props → local state ──────────────────

  useEffect(() => {
    if (props.dynamic_query_function !== '' && props.dynamic_query_function !== null) {
      if (!usingDynamicParamChoices.current) {
        setBackdropOpen(true);
        snackActions.info('Querying payload type container for options...');
        getDynamicParamsFn({
          variables: {
            callback: props.callback_id, parameter_name: props.name,
            command: props.commandInfo.cmd, payload_type: props.commandInfo.payloadtype.name,
            other_parameters: props.getOtherParameters(),
          },
        });
      }
      usingDynamicParamChoices.current = true;
    }
    if (props.type === 'Boolean') {
      if (value === '' || currentParameterGroup.current !== props.parameterGroupName) {
        setBoolValue(props.value); setValue(props.value);
      }
    } else if (props.type === 'Array') {
      setArrayValue(props.value);
    } else if (props.type === 'FileMultiple') {
      setFileMultValue(props.value);
    } else if (props.type === 'TypedArray') {
      if (value === '' || currentParameterGroup.current !== props.parameterGroupName) {
        if (props.value.length > 0 && props.value[0][0] === '') {
          setBackdropOpen(true);
          snackActions.info('PayloadType Container parsing TypedArray values...');
          parseTypedArrayFn({
            variables: {
              callback: props.callback_id, parameter_name: props.name,
              command: props.commandInfo.cmd, payload_type: props.commandInfo.payloadtype.name,
              input_array: props.value.reduce((prev: string[], cur: any) => [...prev, cur[1]], []),
            },
          });
        } else { setTypedArrayValue(props.value); setValue(props.value); }
        if (props.dynamic_query_function === '' || props.dynamic_query_function === null) setChoiceOptions(props.choices);
      }
    } else if (props.type === 'ChooseMultiple' && (props.dynamic_query_function === '' || props.dynamic_query_function === null)) {
      if (value === '' || currentParameterGroup.current !== props.parameterGroupName) {
        setChooseMultipleValue(props.value); setValue(props.value); setChoiceOptions(props.choices);
      }
    } else if (props.type === 'LinkInfo') {
      if (props.choices.length > 0 && value === '') { setChoiceOptions([...props.choices]); onChangeLinkInfo(0); }
    } else if (props.type === 'AgentConnect') {
      if (props.choices.length > 0) {
        let shouldUpdate = false;
        let hostNum = agentConnectHost < props.choices.length ? agentConnectHost : 0;
        if (hostNum !== agentConnectHost) setAgentConnectHost(0);
        if (arraysAreDifferent(props.choices, agentConnectHostOptions)) { setAgentConnectHostOptions(props.choices); shouldUpdate = true; }
        let payloadNum = agentConnectPayload < props.choices[hostNum]['payloads'].length ? agentConnectPayload : 0;
        if (agentConnectPayload !== payloadNum) setAgentConnectPayload(payloadNum);
        if (arraysAreDifferent(props.choices[hostNum]['payloads'], agentConnectPayloadOptions)) { setAgentConnectPayloadOptions(props.choices[hostNum]['payloads']); shouldUpdate = true; }
        if (props.choices[hostNum]['payloads'].length > 0) {
          if (props.choices[hostNum]['payloads'][payloadNum]['c2info'].length > 0) {
            if (arraysAreDifferent(props.choices[hostNum]['payloads'][payloadNum]['c2info'], agentConnectC2ProfileOptions)) { setAgentConnectC2ProfileOptions(props.choices[hostNum]['payloads'][payloadNum]['c2info']); shouldUpdate = true; }
            if (agentConnectHost !== hostNum || agentConnectPayload !== payloadNum || shouldUpdate) onChangeAgentConnect(hostNum, payloadNum, 0);
          }
          if (locallySubmenuOpenPreventTaskingRef.current) { props.setSubmenuOpenPreventTasking(false); locallySubmenuOpenPreventTaskingRef.current = false; }
        } else {
          if (!setAlarmAboutNoP2pRef.current) {
            setAlarmAboutNoP2pRef.current = true;
            snackActions.warning('Mythic knows of no host with a P2P payload. Please add one.');
            props.setSubmenuOpenPreventTasking(true); locallySubmenuOpenPreventTaskingRef.current = true;
          }
        }
      } else {
        if (agentConnectHostOptions.length > 0) setAgentConnectHostOptions([]);
        if (agentConnectPayloadOptions.length > 0) setAgentConnectPayloadOptions([]);
        if (agentConnectC2ProfileOptions.length > 0) setAgentConnectC2ProfileOptions([]);
        if (!setAlarmAboutNoP2pRef.current) {
          setAlarmAboutNoP2pRef.current = true;
          snackActions.warning('Mythic knows of no host with a P2P payload. Please add one.');
          props.setSubmenuOpenPreventTasking(true); locallySubmenuOpenPreventTaskingRef.current = true;
        }
      }
    } else {
      if (value === '') {
        if (props.type === 'Number') {
          setValue(props.value === '' ? 0 : parseInt(props.value, 10) || 0);
        } else { setValue(props.value); }
      }
      if (props.type === 'CredentialJson') {
        setChoiceOptions([...props.choices]);
        if (updateToLatestCredential.current) { setValue(0); props.onChange(props.name, { ...props.choices[0] }, false); updateToLatestCredential.current = false; }
        if (value === '') setValue(0);
      }
      if (props.dynamic_query_function === null && value === '') { setChoiceOptions([...props.choices]); setValue(props.value); }
      else if (props.choices.length !== ChoiceOptions.length && !usingDynamicParamChoices.current) { setChoiceOptions([...props.choices]); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.choices, props.default_value, props.type, props.value]);

  // ── Event handlers ──────────────────────────────────────────────

  const onChangeLinkInfo = (index: number) => {
    let choice: any;
    if (props.choices[index]['source']['id'] === props.callback_id) choice = props.choices[index]['destination'];
    else choice = props.choices[index]['source'];
    const c2params = choice['c2profileparametersinstances'].reduce((prev: any, opt: any) => {
      if (opt.c2_profile_id === props.choices[index]['c2profile']['id']) {
        return { ...prev, [opt.c2profileparameter.name]: !opt.c2profileparameter.crypto_type ? opt.value : { crypto_type: opt.c2profileparameter.crypto_type, enc_key: opt.enc_key, dec_key: opt.dec_key } };
      }
      return prev;
    }, {});
    props.onChange(props.name, { host: choice.host, agent_uuid: choice.payload.uuid, callback_uuid: choice.agent_callback_id, c2_profile: { name: props.choices[index]['c2profile']['name'], parameters: c2params } }, false);
    setValue(index);
  };
  const onChangeValue = (evt: any) => { setValue(evt.target.value); props.onChange(props.name, evt.target.value, false); };
  const onChangeCredentialJSONValue = (evt: any) => { setValue(evt.target.value); props.onChange(props.name, ChoiceOptions[evt.target.value], false); };
  const onChangeChooseMultiple = (event: any) => { const { value: options } = event.target; setChooseMultipleValue(options); setValue(options); props.onChange(props.name, options, false); };
  const onChangeText = (_name: string, v: string, error: boolean) => { setValue(v); props.onChange(props.name, v, error); };
  const onChangeTextChooseOneCustom = (_name: string, newValue: string, error: boolean) => {
    setChooseOneCustomValue(newValue);
    props.onChange(props.name, newValue === '' ? value : newValue, error);
  };
  const onChangeNumber = (_name: string, v: string, error: boolean) => { setValue(parseInt(v, 10)); props.onChange(props.name, parseInt(v, 10), error); };
  const onSwitchChange = (event: React.ChangeEvent<HTMLInputElement>) => { setBoolValue(event.target.checked); setValue(event.target.checked); props.onChange(props.name, event.target.checked, false); };
  const onFileChange = (newFile: any) => { setFileValue({ name: newFile.name }); props.onChange(props.name, newFile, false); };
  const onFileMultChange = (newFiles: any) => { setFileMultValue([...newFiles]); props.onChange(props.name, [...newFiles], false); };

  const onChangeAgentConnectHost2 = (event: any) => {
    setAgentConnectHost(event.target.value);
    setAgentConnectPayloadOptions(props.choices[event.target.value]['payloads']);
    if (props.choices[event.target.value]['payloads'].length > 0) {
      setAgentConnectPayload(0);
      if (props.choices[event.target.value]['payloads'][0]['c2info'].length > 0) {
        setAgentConnectC2ProfileOptions(props.choices[0]['payloads'][0]['c2info']); setAgentConnectC2Profile(0);
        onChangeAgentConnect(event.target.value, 0, 0);
      } else { setAgentConnectC2ProfileOptions([]); }
    } else { setAgentConnectPayloadOptions([]); setAgentConnectC2ProfileOptions([]); }
  };
  const onChangeAgentConnectPayload2 = (event: any) => {
    setAgentConnectPayload(event.target.value);
    setAgentConnectC2ProfileOptions(props.choices[agentConnectHost]['payloads'][event.target.value]['c2info']);
    if (props.choices[agentConnectHost]['payloads'][event.target.value]['c2info'].length > 0) {
      setAgentConnectC2Profile(0); onChangeAgentConnect(agentConnectHost, event.target.value, 0);
    }
  };
  const onChangeAgentConnectC2Profile2 = (event: any) => { setAgentConnectC2Profile(event.target.value); onChangeAgentConnect(agentConnectHost, agentConnectPayload, event.target.value); };
  const onAgentConnectAddNewPayloadOnHost2 = () => {
    if (agentConnectNewHost === '') { snackActions.error('Must set a hostname'); return; }
    props.setSubmenuOpenPreventTasking(false); locallySubmenuOpenPreventTaskingRef.current = false;
    props.onAgentConnectAddNewPayloadOnHost(agentConnectNewHost.toUpperCase(), props.payload_choices![agentConnectNewPayload].id);
    setOpenAdditionalPayloadOnHostmenu(false);
  };
  const onAgentConnectRemovePayloadOnHost2 = () => {
    if (props.choices[agentConnectHost]['payloads'][agentConnectPayload].payloadOnHostID) {
      props.onAgentConnectRemovePayloadOnHost({ payload: props.choices[agentConnectHost]['payloads'][agentConnectPayload], host: agentConnectHostOptions[agentConnectHost].host });
    } else { snackActions.warning("Can't remove a callback"); }
  };

  const testParameterValues = (curVal: string): boolean => {
    if (props.required && props.verifier_regex !== '') return !RegExp(props.verifier_regex).test(curVal);
    if (props.verifier_regex !== '' && curVal !== '') return !RegExp(props.verifier_regex).test(curVal);
    return false;
  };

  // ── Array helpers ───────────────────────────────────────────────

  const addNewArrayValue = () => { const n = [...arrayValue, '']; setArrayValue(n); props.onChange(props.name, n, false); };
  const removeArrayValue = (index: number) => { const r = [...arrayValue]; r.splice(index, 1); setArrayValue(r); props.onChange(props.name, r, false); };
  const onChangeArrayText = (v: string, _err: boolean, index: number) => {
    let values = [...arrayValue];
    if (v.includes('\n') && treatNewlinesAsNewEntries) {
      const parts = v.split('\n'); values = [...values, ...parts.slice(1)]; values[index] = parts[0];
    } else { values[index] = v; }
    setArrayValue(values); props.onChange(props.name, values, false);
  };
  const addNewTypedArrayValue = () => {
    const def = props.default_value !== '' && props.default_value !== '[]' ? props.default_value : props.choices[0];
    const n = [...typedArrayValue, [def, '']]; setTypedArrayValue(n); props.onChange(props.name, n, false);
  };
  const removeTypedArrayValue = (index: number) => { const r = [...typedArrayValue]; r.splice(index, 1); setTypedArrayValue(r); props.onChange(props.name, r, false); };
  const onChangeTypedArrayText = (v: string, _err: boolean, index: number) => {
    let values = [...typedArrayValue];
    if (v.includes('\n') && treatNewlinesAsNewEntries) {
      const parts = v.split('\n'); values = [...values, [props.default_value, ...parts.slice(1)]]; values[index][1] = parts[0];
    } else { values[index][1] = v; }
    setTypedArrayValue(values); props.onChange(props.name, values, false);
  };
  const onChangeTypedArrayChoice = (evt: any, index: number) => {
    const values = [...typedArrayValue]; values[index][0] = evt.target.value; setTypedArrayValue(values); props.onChange(props.name, values, false);
  };

  const onCreateCredential = (c: any) => { createCredentialFn({ variables: c }); };
  const onDeleteCredential = () => { deleteCredentialFn({ variables: { deleted: true, credential_id: ChoiceOptions[value].id } }); };

  // ── Render parameter by type ────────────────────────────────────

  const getParameterObject = (): React.ReactNode => {
    switch (props.type) {
      case 'ChooseOneCustom':
        return (
          <div style={{ position: 'relative' }}>
            <Backdrop open={backdropOpen} style={{ zIndex: 2, position: 'absolute' }} invisible={false}><CircularProgress color="inherit" /></Backdrop>
            <div style={{ width: '100%', display: 'flex', alignItems: 'center' }}>
              <FormControl style={{ width: '50%' }}>
                <Select autoFocus={props.autoFocus} multiple={false} value={value} disabled={chooseOneCustomValue !== ''} onChange={onChangeValue}>
                  {ChoiceOptions.map((opt: any, i: number) => (
                    <MenuItem key={props.name + i} value={opt}><Typography style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{opt}</Typography></MenuItem>
                  ))}
                </Select>
              </FormControl>
              OR
              <MythicTextField requiredValue={props.required} placeholder="Custom Value" value={chooseOneCustomValue} multiline maxRows={5}
                validate={testParameterValues} errorText={'Must match: ' + props.verifier_regex}
                onChange={onChangeTextChooseOneCustom} inline onEnter={props.onSubmit} autoFocus={props.autoFocus} name={props.name} />
              {props.dynamic_query_function !== '' && props.dynamic_query_function !== null && (
                <MythicStyledTooltip title="ReIssue Dynamic Query Function"><IconButton onClick={reIssueDynamicQueryFunction}><RefreshIcon /></IconButton></MythicStyledTooltip>
              )}
            </div>
          </div>
        );
      case 'ChooseOne':
      case 'ChooseMultiple':
        return (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
            <Backdrop open={backdropOpen} style={{ zIndex: 2, position: 'absolute' }} invisible={false}><CircularProgress color="inherit" /></Backdrop>
            <FormControl style={{ width: '100%' }}>
              {ChoiceOptions.length === 0 && <InputLabel>No Options Available</InputLabel>}
              <Select disabled={ChoiceOptions.length === 0} autoFocus={props.autoFocus} multiple={props.type === 'ChooseMultiple'}
                value={props.type === 'ChooseMultiple' ? chooseMultipleValue : value}
                onChange={props.type === 'ChooseMultiple' ? onChangeChooseMultiple : onChangeValue}>
                {ChoiceOptions.map((opt: any, i: number) => (
                  <MenuItem key={props.name + i} value={usingDynamicParamComplexChoices.current ? opt.value : opt}>
                    <Typography style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap', display: 'inline-block' }}>
                      {usingDynamicParamComplexChoices.current ? opt.display_value : opt}
                    </Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {props.dynamic_query_function !== '' && props.dynamic_query_function !== null && (
              <MythicStyledTooltip title="ReIssue Dynamic Query Function"><IconButton onClick={reIssueDynamicQueryFunction}><RefreshIcon /></IconButton></MythicStyledTooltip>
            )}
          </div>
        );
      case 'Array':
        return (
          <TableContainer>
            <Table size="small" style={{ tableLayout: 'fixed', maxWidth: '100%', overflow: 'auto' }}>
              <TableBody>
                <TableRow><MythicStyledTableCell>Treat new lines as new entries</MythicStyledTableCell><MythicStyledTableCell><Switch checked={treatNewlinesAsNewEntries} onChange={() => setTreatNewlinesAsNewEntries(!treatNewlinesAsNewEntries)} color="info" /></MythicStyledTableCell></TableRow>
              </TableBody>
            </Table>
            <Table size="small" style={{ tableLayout: 'fixed', maxWidth: '100%', overflow: 'auto' }}>
              <TableBody>
                {arrayValue.map((a, i) => (
                  <TableRow key={'array' + props.name + i}>
                    <MythicStyledTableCell style={{ width: '2rem' }}><MythicStyledTooltip title="Remove array element"><IconButton onClick={() => removeArrayValue(i)} color="error"><DeleteIcon /></IconButton></MythicStyledTooltip></MythicStyledTableCell>
                    <MythicStyledTableCell>
                      <MythicTextField requiredValue={props.required} placeholder="" value={a} multiline autoFocus={props.autoFocus || i > 0}
                        onChange={(_n: string, v: string, e: boolean) => onChangeArrayText(v, e, i)} inline maxRows={5}
                        validate={testParameterValues} errorText={'Must match: ' + props.verifier_regex} name={props.name + '_arr_' + i} />
                    </MythicStyledTableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <MythicStyledTableCell style={{ width: '5rem', paddingLeft: '0' }}><MythicStyledTooltip title="Add new array element"><IconButton onClick={addNewArrayValue} size="large"><AddCircleIcon color="success" /></IconButton></MythicStyledTooltip></MythicStyledTableCell>
                  <MythicStyledTableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        );
      case 'TypedArray':
        return (
          <TableContainer>
            <Table size="small" style={{ tableLayout: 'fixed', maxWidth: '100%', overflow: 'auto' }}>
              <TableBody>
                <TableRow><MythicStyledTableCell>Treat new lines as new entries</MythicStyledTableCell><MythicStyledTableCell><Switch checked={treatNewlinesAsNewEntries} onChange={() => setTreatNewlinesAsNewEntries(!treatNewlinesAsNewEntries)} color="info" /></MythicStyledTableCell></TableRow>
              </TableBody>
            </Table>
            <Table size="small" style={{ tableLayout: 'fixed', maxWidth: '100%', overflow: 'auto' }}>
              <TableBody>
                {typedArrayValue.map((a: any, i: number) => (
                  <TableRow key={'typedarray' + props.name + i}>
                    <MythicStyledTableCell style={{ width: '2rem', paddingLeft: '0' }}><IconButton onClick={() => removeTypedArrayValue(i)} size="large"><DeleteIcon color="error" /></IconButton></MythicStyledTableCell>
                    <MythicStyledTableCell>
                      <div style={{ display: 'inline-flex', alignItems: 'center', width: '100%' }}>
                        <FormControl style={{ width: '30%' }}>
                          <Select native autoFocus={props.autoFocus} value={a[0]} onChange={(e) => onChangeTypedArrayChoice(e, i)}>
                            {ChoiceOptions.map((opt: any, j: number) => <option key={props.name + j} value={opt}>{opt}</option>)}
                          </Select>
                        </FormControl>
                        <MythicTextField requiredValue={props.required} placeholder="" value={a[1]} multiline autoFocus={props.autoFocus || i > 0}
                          onChange={(_n: string, v: string, e: boolean) => onChangeTypedArrayText(v, e, i)} inline maxRows={5}
                          validate={testParameterValues} errorText={'Must match: ' + props.verifier_regex} name={props.name + '_typed_' + i} />
                      </div>
                    </MythicStyledTableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <MythicStyledTableCell style={{ width: '5rem', paddingLeft: '0' }}><IconButton onClick={addNewTypedArrayValue} size="large"><AddCircleIcon color="success" /></IconButton></MythicStyledTableCell>
                  <MythicStyledTableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        );
      case 'String':
        return <MythicTextField requiredValue={props.required} placeholder={props.default_value} value={value} multiline maxRows={5} onChange={onChangeText} inline onEnter={props.onSubmit} autoFocus={props.autoFocus} validate={testParameterValues} errorText={'Must match: ' + props.verifier_regex} name={props.name} />;
      case 'Number':
        return <MythicTextField requiredValue={props.required} placeholder={props.default_value} value={value} multiline={false} type="number" onChange={onChangeNumber} inline onEnter={props.onSubmit} autoFocus={props.autoFocus} validate={testParameterValues} errorText={'Must match: ' + props.verifier_regex} name={props.name} />;
      case 'Boolean':
        return <Switch checked={boolValue} onChange={onSwitchChange} color="info" />;
      case 'File':
        return <DragAndDropFileUpload value={fileValue} multiple={false} onChange={onFileChange} />;
      case 'FileMultiple':
        return <DragAndDropFileUpload values={fileMultValue} multiple={true} onChange={onFileMultChange} />;
      case 'LinkInfo':
        return (
          <FormControl style={{ width: '100%' }}>
            <Select value={value} autoFocus={props.autoFocus} onChange={(evt) => onChangeLinkInfo(evt.target.value as number)}>
              {props.choices.map((opt: any, i: number) => (
                <MenuItem key={props.name + i} value={i}><Typography style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{opt.display}</Typography></MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      case 'PayloadList':
        return (
          <FormControl style={{ width: '100%' }}>
            <Select value={value} autoFocus={props.autoFocus} onChange={onChangeValue}>
              {props.choices.map((opt: any, i: number) => (
                <MenuItem key={props.name + i} value={opt.uuid}><Typography style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{opt.display}</Typography></MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      case 'AgentConnect':
        return (
          <>
            <Table size="small" style={{ tableLayout: 'fixed', maxWidth: '100%', overflow: 'auto' }}>
              <TableBody>
                {openAdditionalPayloadOnHostMenu ? (
                  <>
                    <TableRow>
                      <MythicStyledTableCell style={{ width: '15em' }}>Hostname</MythicStyledTableCell>
                      <MythicStyledTableCell><MythicTextField requiredValue placeholder="hostname" value={agentConnectNewHost} multiline={false} autoFocus={props.autoFocus} onChange={(_n: string, v: string) => setAgentConnectNewHost(v)} inline name="agentconnect_host" /></MythicStyledTableCell>
                    </TableRow>
                    <TableRow>
                      <MythicStyledTableCell>Payload on that host</MythicStyledTableCell>
                      <MythicStyledTableCell>
                        <FormControl style={{ width: '100%' }}>
                          <Select value={props.payload_choices!.length > 0 ? agentConnectNewPayload : ''} onChange={(e) => setAgentConnectNewPayload(e.target.value as number)}>
                            {(props.payload_choices ?? []).map((opt: any, i: number) => (
                              <MenuItem key={props.name + 'newpayload' + i} value={i}><Typography style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{opt.display}</Typography></MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </MythicStyledTableCell>
                    </TableRow>
                    <TableRow>
                      <MythicStyledTableCell><Button style={{ color: theme.palette.success.main, padding: 0 }} onClick={onAgentConnectAddNewPayloadOnHost2}><AddCircleIcon />Confirm</Button></MythicStyledTableCell>
                      <MythicStyledTableCell><Button style={{ color: theme.palette.warning.main, padding: 0 }} onClick={() => { setOpenAdditionalPayloadOnHostmenu(false); props.setSubmenuOpenPreventTasking(false); locallySubmenuOpenPreventTaskingRef.current = false; }}><CancelIcon />Cancel</Button></MythicStyledTableCell>
                    </TableRow>
                  </>
                ) : (
                  <>
                    <TableRow>
                      <MythicStyledTableCell style={{ width: '14em' }}>Host</MythicStyledTableCell>
                      <MythicStyledTableCell>
                        <FormControl style={{ width: '100%' }}>
                          <Select value={agentConnectHostOptions.length > 0 ? agentConnectHost : ''} onChange={onChangeAgentConnectHost2}>
                            {agentConnectHostOptions.map((opt: any, i: number) => <MenuItem key={props.name + 'connecthost' + i} value={i}>{opt.host}</MenuItem>)}
                          </Select>
                        </FormControl>
                      </MythicStyledTableCell>
                    </TableRow>
                    <TableRow>
                      <MythicStyledTableCell>Payload / Callback</MythicStyledTableCell>
                      <MythicStyledTableCell>
                        <FormControl style={{ width: '100%' }}>
                          <Select value={agentConnectPayloadOptions.length > 0 ? agentConnectPayload : ''} onChange={onChangeAgentConnectPayload2}>
                            {agentConnectPayloadOptions.map((opt: any, i: number) => (
                              <MenuItem key={props.name + 'connectagent' + i} value={i}><Typography style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{opt.display}</Typography></MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </MythicStyledTableCell>
                    </TableRow>
                    <TableRow>
                      <MythicStyledTableCell>
                        <MythicStyledTooltip title="Associate new payload with a specific host for linking">
                          <Button style={{ color: theme.palette.success.main, padding: 0 }} onClick={() => { setOpenAdditionalPayloadOnHostmenu(true); props.setSubmenuOpenPreventTasking(true); locallySubmenuOpenPreventTaskingRef.current = true; }}><AddCircleIcon />Register New</Button>
                        </MythicStyledTooltip>
                      </MythicStyledTableCell>
                      <MythicStyledTableCell>
                        <MythicStyledTooltip title="Mark associated payload as no longer on host">
                          <Button style={{ color: theme.palette.error.main, padding: 0 }} onClick={onAgentConnectRemovePayloadOnHost2}><DeleteIcon />Remove Listed</Button>
                        </MythicStyledTooltip>
                      </MythicStyledTableCell>
                    </TableRow>
                    <TableRow>
                      <MythicStyledTableCell>C2 Profile</MythicStyledTableCell>
                      <MythicStyledTableCell>
                        <FormControl style={{ width: '100%' }}>
                          <Select value={agentConnectC2ProfileOptions.length > 0 ? agentConnectC2Profile : ''} onChange={onChangeAgentConnectC2Profile2}>
                            {agentConnectC2ProfileOptions.map((opt: any, i: number) => <MenuItem key={props.name + 'connectprofile' + i} value={i}>{opt.name}</MenuItem>)}
                          </Select>
                        </FormControl>
                      </MythicStyledTableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
            {agentConnectC2ProfileOptions.length > 0 && !openAdditionalPayloadOnHostMenu && (
              <Table size="small" style={{ tableLayout: 'fixed', maxWidth: '100%', overflow: 'scroll' }}>
                <TableHead><TableRow><MythicStyledTableCell style={{ width: '30%' }}>Parameter</MythicStyledTableCell><MythicStyledTableCell>Value</MythicStyledTableCell></TableRow></TableHead>
                <TableBody>
                  {agentConnectC2ProfileOptions[agentConnectC2Profile]['parameters'].map((opt: any, i: number) => (
                    <TableRow key={'agentconnectparameters' + props.name + i}><MythicStyledTableCell>{opt.name}</MythicStyledTableCell><MythicStyledTableCell><pre>{JSON.stringify(opt.value, null, 2)}</pre></MythicStyledTableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        );
      case 'CredentialJson':
        return (
          <>
            {createCredentialDialogOpen && (
              <MythicDialog fullWidth maxWidth="md" open={createCredentialDialogOpen} onClose={() => setCreateCredentialDialogOpen(false)}
                innerDialog={<CredentialNewDialog onSubmit={onCreateCredential} onClose={() => setCreateCredentialDialogOpen(false)} />} />
            )}
            <FormControl style={{ width: '100%' }}>
              <Select value={value} autoFocus={props.autoFocus} onChange={onChangeCredentialJSONValue}>
                {ChoiceOptions.map((opt: any, i: number) => (
                  <MenuItem key={props.name + i} value={i}>
                    <Typography style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                      {opt.account + (opt.realm === '' ? '' : '@' + opt.realm) + ' - ' + (opt.credential_text.length > CREDENTIAL_TEXT_MAX_DISPLAY_LEN ? opt.credential_text.substring(0, CREDENTIAL_TEXT_MAX_DISPLAY_LEN) + '...' : opt.credential_text)}
                      {opt.comment.length > 0 && <><b>{'\nComment: '}</b>{opt.comment}</>}
                    </Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button color="success" style={{ marginRight: '20px' }} onClick={() => setCreateCredentialDialogOpen(true)}><AddCircleIcon style={{ color: theme.palette.success.main, background: 'white', borderRadius: '10px', marginRight: '5px' }} /> Credential</Button>
            <Button color="warning" style={{ padding: 0 }} onClick={onDeleteCredential}><DeleteIcon style={{ color: theme.palette.error.main, marginRight: '5px' }} /> Credential</Button>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <TableRow key={'buildparam' + props.id}>
      <MythicStyledTableCell>
        <Typography style={{ fontWeight: '600', wordBreak: 'break-all' }}>{props.display_name}</Typography>
        <Typography variant="body2" style={{ fontSize: theme.typography.pxToRem(14), wordBreak: 'break-all' }}>{props.description}</Typography>
        {props.required && <Typography component="div" color="warning">Required</Typography>}
      </MythicStyledTableCell>
      <MythicStyledTableCell>{getParameterObject()}</MythicStyledTableCell>
    </TableRow>
  );
}

// ── TaskParametersDialog ──────────────────────────────────────────

export function TaskParametersDialog(props: TaskParametersDialogProps) {
  const [backdropOpen, setBackdropOpen] = useState(false);
  const [commandInfo, setCommandInfo] = useState<any>({});
  const [parameterGroups, setParameterGroups] = useState<string[]>([]);
  const [selectedParameterGroup, setSelectedParameterGroup] = useState('Default');
  const [parameters, setParameters] = useState<ParamValue[]>([]);
  const [rawParameters, setRawParameters] = useState<any>(false);
  const [requiredPieces, setRequiredPieces] = useState<Record<string, boolean>>({ all: false, loaded: false, edges: false, credentials: false });

  const [getAllCommands, { data: allCommandsLoading }] = useLazyQuery<any>(getAllCommandsQuery, { fetchPolicy: 'no-cache' });
  const [getLoadedCommands, { data: loadedCommandsLoading }] = useLazyQuery<any>(GetLoadedCommandsQuery, { fetchPolicy: 'no-cache' });
  const [getAllEdges, { data: loadedAllEdgesLoading }] = useLazyQuery<any>(getAllEdgesQuery, { fetchPolicy: 'no-cache' });
  const [getAllPayloads, { data: loadedAllPayloadsLoading }] = useLazyQuery<any>(getAllPayloadsQuery, { fetchPolicy: 'no-cache' });
  const [getAllPayloadsOnHosts, { data: loadedAllPayloadsOnHostsLoading }] = useLazyQuery<any>(getAllPayloadsOnHostsQuery, { fetchPolicy: 'no-cache' });
  const [getAllCredentials, { data: loadedCredentialsLoading }] = useLazyQuery<any>(getCredentialsQuery, { fetchPolicy: 'no-cache' });

  const [addPayloadOnHost] = useMutation(addPayloadOnHostMutation, {
    onCompleted: (data: any) => {
      if (data.insert_payloadonhost_one.id) snackActions.success('Successfully tracked payload on host');
      getAllPayloadsOnHosts({ variables: { operation_id: props.operation_id } });
    },
    onError: (err: any) => snackActions.error('Failed to add payload on host: ' + err.message),
  });
  const [RemovePayloadOnHost] = useMutation(removePayloadOnHostMutation, {
    onCompleted: () => getAllPayloadsOnHosts({ variables: { operation_id: props.operation_id } }),
    onError: (err: any) => snackActions.error('Failed to remove payload from host: ' + err.message),
  });

  const [submenuOpenPreventTask, setSubmenuOpenPreventTask] = useState(false);

  useQuery(getCommandQuery, {
    variables: { id: props.command.id },
    fetchPolicy: 'no-cache',
    onCompleted: (data: any) => {
      const rp: Record<string, boolean> = { all: false, loaded: false, edges: false, credentials: false };
      const groupNames: string[] = [];
      data.command_by_pk.commandparameters.forEach((cmd: CommandParam) => {
        if (!groupNames.includes(cmd.parameter_group_name)) groupNames.push(cmd.parameter_group_name);
        if (cmd.type === 'LinkInfo') rp['edges'] = true;
        else if (cmd.choices_are_all_commands) rp['all'] = true;
        else if (cmd.choices_are_loaded_commands) rp['loaded'] = true;
        else if (cmd.type === 'AgentConnect') { rp['connect'] = true; rp['payloads'] = true; }
        else if (cmd.type === 'PayloadList') rp['payloads'] = true;
        else if (cmd.type.includes('Credential')) rp['credentials'] = true;
      });
      groupNames.sort();
      setParameterGroups(groupNames);
      if (props.command.groupName && groupNames.includes(props.command.groupName)) setSelectedParameterGroup(props.command.groupName);
      else if (!groupNames.includes('Default')) setSelectedParameterGroup(groupNames[0]);
      setCommandInfo({ ...data.command_by_pk });
      if (rp['edges']) getAllEdges({ variables: { callback_id: props.callback_id } });
      if (rp['all']) getAllCommands({ variables: { payload_type_id: props.payloadtype_id } });
      if (rp['loaded']) getLoadedCommands({ variables: { callback_id: props.callback_id } });
      if (rp['payloads']) getAllPayloads({ variables: { operation_id: props.operation_id } });
      if (rp['connect']) getAllPayloadsOnHosts({ variables: { operation_id: props.operation_id } });
      if (rp['credentials']) getAllCredentials({ variables: { operation_id: props.operation_id } });
      setRequiredPieces(rp);
      setRawParameters({ ...data });
    },
  });

  const addedCredential = useCallback(() => { getAllCredentials({ variables: { operation_id: props.operation_id } }); }, [getAllCredentials, props.operation_id]);
  const removedCredential = useCallback(() => { getAllCredentials({ variables: { operation_id: props.operation_id } }); }, [getAllCredentials, props.operation_id]);

  // ── Main useEffect — process parameters once all data loaded ────

  useEffect(() => {
    if (!props.command.parsedParameters) props.command.parsedParameters = {};

    const getLinkInfoFromAgentConnect = (choices: any[]): any => {
      if (choices.length === 0) return {};
      const c2params = choices[0]['payloads'][0]['c2info'][0].parameters.reduce((prev: any, opt: any) => ({ ...prev, [opt.name]: opt.value }), {});
      const val: any = { host: choices[0]['host'], agent_uuid: choices[0]['payloads'][0].uuid, c2_profile: { name: choices[0]['payloads'][0]['c2info'][0].name, parameters: c2params } };
      if (choices[0]['payloads'][0].type === 'callback') val['callback_uuid'] = choices[0]['payloads'][0]['agent_callback_id'];
      return val;
    };
    const getLinkInfoValue = (choices: any[]): any => {
      if (choices.length === 0) return {};
      const choice = choices[0]['source']['id'] === props.callback_id ? choices[0]['destination'] : choices[0]['source'];
      const c2params = choice['c2profileparametersinstances'].reduce((prev: any, opt: any) => {
        if (opt.c2_profile_id === choices[0]['c2profile']['id']) {
          return { ...prev, [opt.c2profileparameter.name]: !opt.c2profileparameter.crypto_type ? opt.value : { crypto_type: opt.c2profileparameter.crypto_type, enc_key: opt.enc_key_base64, dec_key: opt.dec_key_base64 } };
        }
        return prev;
      }, {});
      return { host: choice.host, agent_uuid: choice.payload.uuid, callback_uuid: choice.agent_callback_id, c2_profile: { name: choices[0]['c2profile']['name'], parameters: c2params } };
    };

    if (rawParameters
      && (!requiredPieces['loaded'] || loadedCommandsLoading)
      && (!requiredPieces['all'] || allCommandsLoading)
      && (!requiredPieces['edges'] || loadedAllEdgesLoading)
      && (!requiredPieces['payloads'] || loadedAllPayloadsLoading)
      && (!requiredPieces['connect'] || loadedAllPayloadsOnHostsLoading)
      && (!requiredPieces['credentials'] || loadedCredentialsLoading)
    ) {
      const params = rawParameters.command_by_pk.commandparameters.reduce((prev: ParamValue[], cmd: any) => {
        if (cmd.parameter_group_name !== selectedParameterGroup) return prev;
        const parsedParameterName = commandInParsedParameters(cmd, props.command.parsedParameters);
        switch (cmd.type) {
          case 'Boolean':
            if (parsedParameterName) return [...prev, { ...cmd, value: props.command.parsedParameters[parsedParameterName] }];
            return [...prev, { ...cmd, value: cmd.default_value ? cmd.default_value.toLowerCase() === 'true' : false }];
          case 'String':
            return [...prev, { ...cmd, value: parsedParameterName ? props.command.parsedParameters[parsedParameterName] : cmd.default_value }];
          case 'Number':
            return [...prev, { ...cmd, value: parsedParameterName ? props.command.parsedParameters[parsedParameterName] : (cmd.default_value === '' ? 0 : parseInt(cmd.default_value, 10)) }];
          case 'Array':
            if (parsedParameterName) return [...prev, { ...cmd, value: props.command.parsedParameters[parsedParameterName] }];
            return [...prev, { ...cmd, value: cmd.default_value.length > 0 ? JSON.parse(cmd.default_value) : [] }];
          case 'TypedArray':
            if (parsedParameterName) return [...prev, { ...cmd, value: props.command.parsedParameters[parsedParameterName] }];
            if (cmd.default_value.length > 0) { try { return [...prev, { ...cmd, value: JSON.parse(cmd.default_value) }]; } catch { return [...prev, { ...cmd, value: [[cmd.default_value, '']] }]; } }
            return [...prev, { ...cmd, value: [] }];
          case 'ChooseOne':
          case 'ChooseOneCustom':
          case 'ChooseMultiple': {
            let choices = cmd.choices;
            let defaultV: any = cmd.default_value;
            if (cmd.type === 'ChooseMultiple') { defaultV = cmd.default_value !== '' ? JSON.parse(cmd.default_value) : []; }
            else { if (choices.length > 0) defaultV = cmd.default_value === '' ? choices[0] : cmd.default_value; }
            const filter = cmd.choice_filter_by_command_attributes;
            if (cmd.choices_are_all_commands) {
              choices = [...allCommandsLoading.command].reduce((prevn: string[], c: any) => {
                let match = true;
                for (const [key, val] of Object.entries(filter)) { if (c.attributes[key] !== undefined) { if (Array.isArray(c.attributes[key])) { if (key === 'supported_os' && c.attributes[key].length === 0) continue; if (!c.attributes[key].includes(val)) match = false; } else { if (c.attributes[key] !== val) match = false; } } }
                return match ? [...prevn, c.cmd] : prevn;
              }, []);
              choices.sort();
              if (choices.length > 0) defaultV = cmd.type === 'ChooseMultiple' ? [] : choices[0];
            } else if (cmd.choices_are_loaded_commands) {
              choices = [...loadedCommandsLoading.loadedcommands].reduce((prevn: string[], c: any) => {
                let match = true;
                for (const [key, val] of Object.entries(filter)) { if (c.command.attributes[key] !== undefined) { if (Array.isArray(c.command.attributes[key])) { if (key === 'supported_os' && c.command.attributes[key].length === 0) continue; if (!c.command.attributes[key].includes(val)) match = false; } else { if (c.command.attributes[key] !== val) match = false; } } }
                return match ? [...prevn, c.command.cmd] : prevn;
              }, []);
              if (choices.length > 0) defaultV = cmd.type === 'ChooseMultiple' ? [] : choices[0];
            }
            if (parsedParameterName) return [...prev, { ...cmd, choices, value: props.command.parsedParameters[parsedParameterName], default_value: defaultV }];
            return [...prev, { ...cmd, choices, default_value: defaultV, value: defaultV }];
          }
          case 'File':
            return [...prev, { ...cmd, value: {} }];
          case 'FileMultiple':
            return [...prev, { ...cmd, value: [] }];
          case 'CredentialJson': {
            let credChoices = loadedCredentialsLoading?.credential ?? [];
            if (cmd.limit_credentials_by_type?.length > 0) credChoices = credChoices.filter((c: any) => cmd.limit_credentials_by_type.includes(c.type));
            if (credChoices.length > 0) {
              const val = parsedParameterName ? props.command.parsedParameters[parsedParameterName] : (cmd.value === '' || cmd.value === undefined ? credChoices[0] : cmd.value);
              return [...prev, { ...cmd, value: val, choices: credChoices }];
            }
            return [...prev, { ...cmd, value: {}, choices: [] }];
          }
          case 'AgentConnect': {
            const agentNewPayloads = loadedAllPayloadsLoading.payload.reduce((prevn: any[], payload: any) => {
              let foundP2P = false;
              const profiles = payload.payloadc2profiles.reduce((p: string[], pr: any) => { if (pr.c2profile.is_p2p) foundP2P = true; return [...p, pr.c2profile.name]; }, []).join(',');
              if (!foundP2P) return prevn;
              return [...prevn, { ...payload, display: b64DecodeUnicode(payload.filemetum.filename_text) + ' - ' + profiles + ' - ' + payload.description, filemetum: { filename_text: b64DecodeUnicode(payload.filemetum.filename_text) } }];
            }, []).sort((a: any, b: any) => a.id < b.id ? 1 : -1);

            const callbacksOrg = loadedAllPayloadsOnHostsLoading.callback.reduce((prevn: any[], entry: any) => {
              const c2info = entry.c2profileparametersinstances.reduce((p: any, cur: any) => {
                const val = !cur.c2profileparameter.crypto_type ? cur.value : { crypto_type: cur.value, enc_key: cur.enc_key_base64, dec_key: cur.dec_key_base64 };
                return cur.c2profile.name in p ? { ...p, [cur.c2profile.name]: [...p[cur.c2profile.name], { name: cur.c2profileparameter.name, value: val }] } : { ...p, [cur.c2profile.name]: [{ name: cur.c2profileparameter.name, value: val }] };
              }, {});
              const c2array = Object.entries(c2info).map(([k, v]) => ({ name: k, parameters: v }));
              const payloadInfo = { ...entry.registered_payload, c2info: c2array, display: 'Callback ' + entry.display_id + ' - ' + entry.description, ...entry, type: 'callback', payloadOnHostID: null };
              const found = prevn.findIndex((h: any) => h.host === entry.host);
              if (found > -1) { prevn[found].payloads = [...prevn[found].payloads, payloadInfo]; return [...prevn]; }
              return [...prevn, { host: entry.host, payloads: [payloadInfo] }];
            }, []);

            const organized = loadedAllPayloadsOnHostsLoading.payloadonhost.reduce((prevn: any[], entry: any) => {
              let found = false;
              const updates = prevn.map((host: any) => {
                if (host.host !== entry.host) return host;
                found = true;
                if (host.payloads.some((p: any) => p.id === entry.payload.id)) return host;
                const c2info = entry.payload.c2profileparametersinstances.reduce((p: any, cur: any) => {
                  const val = !cur.c2profileparameter.crypto_type ? cur.value : { crypto_type: cur.value, enc_key: cur.enc_key_base64, dec_key: cur.dec_key_base64 };
                  return cur.c2profile.name in p ? { ...p, [cur.c2profile.name]: [...p[cur.c2profile.name], { name: cur.c2profileparameter.name, value: val }] } : { ...p, [cur.c2profile.name]: [{ name: cur.c2profileparameter.name, value: val }] };
                }, {});
                const c2array = Object.entries(c2info).map(([k, v]) => ({ name: k, parameters: v }));
                const payloadInfo = { ...entry.payload, c2info: c2array, display: b64DecodeUnicode(entry.payload.filemetum.filename_text) + ' - ' + entry.payload.description, type: 'payload', payloadOnHostID: entry.id, filemetum: { filename_text: b64DecodeUnicode(entry.payload.filemetum.filename_text) } };
                return { ...host, payloads: [...host.payloads, payloadInfo].sort((a: any, b: any) => a.filemetum.filename_text === b.filemetum.filename_text ? (a.id < b.id ? 1 : -1) : (a.filemetum.filename_text < b.filemetum.filename_text ? 1 : -1)) };
              });
              if (!found) {
                const c2info = entry.payload.c2profileparametersinstances.reduce((p: any, cur: any) => {
                  const val = !cur.c2profileparameter.crypto_type ? cur.value : { crypto_type: cur.value, enc_key: cur.enc_key_base64, dec_key: cur.dec_key_base64 };
                  return cur.c2profile.name in p ? { ...p, [cur.c2profile.name]: [...p[cur.c2profile.name], { name: cur.c2profileparameter.name, value: val }] } : { ...p, [cur.c2profile.name]: [{ name: cur.c2profileparameter.name, value: val }] };
                }, {});
                const c2array = Object.entries(c2info).map(([k, v]) => ({ name: k, parameters: v }));
                const payloadInfo = { ...entry.payload, c2info: c2array, display: b64DecodeUnicode(entry.payload.filemetum.filename_text) + ' - ' + entry.payload.description, type: 'payload', payloadOnHostID: entry.id, filemetum: { filename_text: b64DecodeUnicode(entry.payload.filemetum.filename_text) } };
                return [...prevn, { host: entry.host, payloads: [payloadInfo] }];
              }
              return updates;
            }, []);

            const allOrganized = callbacksOrg.reduce((prevn: any[], cur: any) => {
              const idx = prevn.findIndex((o: any) => o.host === cur.host);
              if (idx > -1) { prevn[idx].payloads = [...prevn[idx].payloads, ...cur.payloads]; return [...prevn]; }
              return [...prevn, { ...cur }];
            }, [...organized]);
            return [...prev, { ...cmd, choices: allOrganized, payload_choices: agentNewPayloads, value: getLinkInfoFromAgentConnect(organized) }];
          }
          case 'PayloadList': {
            let supportedAgents = [...cmd.supported_agents];
            const emptyIdx = supportedAgents.indexOf('');
            if (emptyIdx !== -1) supportedAgents.splice(emptyIdx);
            const buildReqs = cmd.supported_agent_build_parameters;
            const payloads = loadedAllPayloadsLoading.payload.reduce((prevn: any[], payload: any) => {
              const profiles = payload.payloadc2profiles.reduce((p: string[], pr: any) => [...p, pr.c2profile.name], []).join(',');
              if (supportedAgents.length > 0 && !supportedAgents.includes(payload.payloadtype.name)) return prevn;
              let matched = true;
              if (payload.payloadtype.name in buildReqs) {
                for (const [key, val] of Object.entries(buildReqs[payload.payloadtype.name])) {
                  payload.buildparameterinstances.forEach((bp: any) => { if (bp.buildparameter.name === key && bp.value !== val) matched = false; });
                }
              }
              if (!matched) return prevn;
              return [...prevn, { ...payload, display: b64DecodeUnicode(payload.filemetum.filename_text) + ' - ' + profiles + ' - ' + payload.description, filemetum: { filename_text: b64DecodeUnicode(payload.filemetum.filename_text) } }];
            }, []).sort((a: any, b: any) => new Date(a.filemetum.timestamp) < new Date(b.filemetum.timestamp) ? 1 : -1);
            if (payloads.length > 0) return [...prev, { ...cmd, choices: payloads, default_value: payloads[0].uuid, value: payloads[0].uuid }];
            return [...prev, { ...cmd, choices: payloads, value: null }];
          }
          case 'LinkInfo': {
            const activeChoices = loadedAllEdgesLoading.callbackgraphedge.reduce((prevn: any[], edge: any) => {
              if (edge.source.id === edge.destination.id) return prevn;
              if (edge.end_timestamp === null) return [...prevn, { ...edge, display: 'Callback ' + edge.source.display_id + ' --' + edge.c2profile.name + '--> Callback ' + edge.destination.display_id + '(Active)' }];
              return prevn;
            }, []);
            const deadChoices = loadedAllEdgesLoading.callbackgraphedge.reduce((prevn: any[], edge: any) => {
              if (edge.source.id === edge.destination.id) return prevn;
              if (edge.end_timestamp !== null) return [...prevn, { ...edge, display: 'Callback ' + edge.source.display_id + ' --' + edge.c2profile.name + '--> Callback ' + edge.destination.display_id + '(Dead at ' + edge.end_timestamp + ')' }];
              return prevn;
            }, []);
            const edgeChoices = [...activeChoices, ...deadChoices];
            if (edgeChoices.length > 0) return [...prev, { ...cmd, choices: edgeChoices, value: getLinkInfoValue(edgeChoices) }];
            return [...prev, { ...cmd, choices: edgeChoices, value: {} }];
          }
          default:
            return [...prev, { ...cmd }];
        }
      }, []);

      const sorted = params.sort((a: ParamValue, b: ParamValue) => a.ui_position > b.ui_position ? 1 : -1);
      if (sorted.length > 0) sorted[0].autoFocus = true;
      for (let i = 0; i < sorted.length; i++) {
        for (let j = 0; j < parameters.length; j++) {
          if (sorted[i].name === parameters[j].name) sorted[i].value = parameters[j].value;
        }
      }
      setParameters(sorted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParameterGroup, rawParameters, loadedCommandsLoading, allCommandsLoading, loadedAllEdgesLoading, requiredPieces, loadedAllPayloadsLoading, loadedCredentialsLoading, loadedAllPayloadsOnHostsLoading, props.callback_id]);

  // ── Submit ──────────────────────────────────────────────────────

  const onSubmit = async () => {
    const newFileUUIDs: string[] = [];
    const collapsedParameters: Record<string, any> = {};
    for (const param of parameters) {
      switch (param.type) {
        case 'String': case 'Boolean': case 'Number': case 'ChooseOne': case 'ChooseOneCustom':
        case 'ChooseMultiple': case 'PayloadList': case 'Array': case 'TypedArray': case 'LinkInfo':
          collapsedParameters[param.name] = param.value; break;
        case 'AgentConnect':
          if (Object.keys(param.value).length === 0) { snackActions.warning('No connection info specified'); return; }
          collapsedParameters[param.name] = param.value; break;
        case 'File': {
          const newUUID = await UploadTaskFile(param.value, 'Uploaded as part of tasking');
          if (!newUUID) return;
          if (newUUID !== 'Missing file in form') { newFileUUIDs.push(newUUID); collapsedParameters[param.name] = newUUID; }
          break;
        }
        case 'FileMultiple': {
          const fileIDs: string[] = [];
          for (let i = 0; i < param.value.length; i++) {
            if (typeof param.value[i] === 'string') { fileIDs.push(param.value[i]); continue; }
            const newUUID = await UploadTaskFile(param.value[i], 'Uploaded as part of tasking');
            if (newUUID && newUUID !== 'Missing file in form') { newFileUUIDs.push(newUUID); fileIDs.push(newUUID); }
            else snackActions.warning('Failed to upload file');
          }
          collapsedParameters[param.name] = fileIDs; break;
        }
        case 'CredentialJson':
          collapsedParameters[param.name] = { account: param.value['account'], comment: param.value['comment'], credential: param.value['credential_text'], realm: param.value['realm'], type: param.value['type'] }; break;
        default: break;
      }
    }
    setBackdropOpen(false);
    props.onSubmit(commandInfo.cmd, JSON.stringify(collapsedParameters), newFileUUIDs, selectedParameterGroup, commandInfo?.payloadtype?.name);
  };

  const onAgentConnectAddNewPayloadOnHost = (host: string, payload: number) => { addPayloadOnHost({ variables: { host, payload_id: payload } }); };
  const onAgentConnectRemovePayloadOnHost = ({ payload, host }: { payload: any; host: string }) => { RemovePayloadOnHost({ variables: { host, payload_id: payload.id, operation_id: payload.operation_id } }); };

  const onChange = useCallback((name: string, value: any, _error: boolean) => {
    setParameters((prev) => prev.map((p) => p.name === name ? { ...p, value } : p));
  }, []);

  const getOtherParameters = useCallback((): Record<string, any> => {
    const collapsed: Record<string, any> = {};
    for (const param of parameters) {
      switch (param.type) {
        case 'String': case 'Boolean': case 'Number': case 'ChooseOne': case 'ChooseOneCustom':
        case 'ChooseMultiple': case 'PayloadList': case 'Array': case 'TypedArray': case 'LinkInfo':
          collapsed[param.name] = param.value; break;
        case 'AgentConnect':
          if (Object.keys(param.value).length > 0) collapsed[param.name] = param.value; break;
        case 'CredentialJson':
          collapsed[param.name] = { account: param.value['account'], comment: param.value['comment'], credential: param.value['credential_text'], realm: param.value['realm'], type: param.value['type'] }; break;
        default: break;
      }
    }
    return collapsed;
  }, [parameters]);

  // ── Render ──────────────────────────────────────────────────────

  return (
    <>
      <DialogTitle id="mythic-draggable-title" style={{ cursor: 'move', width: '100%' }}>
        {commandInfo.cmd}&apos;s Parameters
      </DialogTitle>
      <DialogContent dividers>
        <Backdrop open={backdropOpen} style={{ zIndex: 2, position: 'absolute' }}><CircularProgress color="inherit" /></Backdrop>
        <Typography component="div">
          <b>Description</b> <pre style={{ margin: 0, wordBreak: 'break-word', overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{commandInfo.description}</pre><br />
          <Divider />
          <b>Requires Admin?</b><pre style={{ margin: 0 }}>{commandInfo.needs_admin ? 'True' : 'False'}</pre><br />
          <Divider />
          {parameterGroups.length > 1 && (
            <FormControl style={{ width: '100%', marginTop: '7px' }}>
              <TextField select label="Parameter Group" value={selectedParameterGroup} onChange={(e) => setSelectedParameterGroup(e.target.value)}>
                {parameterGroups.map((opt, i) => <MenuItem key={'paramgroup' + i} value={opt}>{opt}</MenuItem>)}
              </TextField>
            </FormControl>
          )}
        </Typography>
        <TableContainer>
          <Table size="small" style={{ tableLayout: 'fixed', maxWidth: '100%', overflow: 'scroll' }}>
            <TableHead><TableRow><TableCell style={{ width: '30%' }}>Parameter</TableCell><TableCell>Value</TableCell></TableRow></TableHead>
            <TableBody>
              {parameters.map((op) => (
                <TaskParametersDialogRow
                  key={'taskparameterrow' + op.id}
                  onSubmit={onSubmit}
                  onChange={onChange}
                  commandInfo={commandInfo}
                  {...op}
                  parameterGroupName={selectedParameterGroup}
                  callback_id={props.callback_id}
                  onAgentConnectAddNewPayloadOnHost={onAgentConnectAddNewPayloadOnHost}
                  onAgentConnectRemovePayloadOnHost={onAgentConnectRemovePayloadOnHost}
                  addedCredential={addedCredential}
                  removedCredential={removedCredential}
                  setSubmenuOpenPreventTasking={setSubmenuOpenPreventTask}
                  getOtherParameters={getOtherParameters}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} variant="contained" color="primary">Close</Button>
        <Button onClick={onSubmit} disabled={submenuOpenPreventTask} variant="contained" color="warning">Task</Button>
      </DialogActions>
    </>
  );
}
