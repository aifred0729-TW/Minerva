// ═══════════════════════════════════════════════════════════════════
//  TaskFromUIButton — Minerva-native TypeScript port
//  (replaces Legacy Callbacks/TaskFromUIButton)
// ═══════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { useLazyQueryCompat as useLazyQuery } from '../lib/useQueryCompat';
import { snackActions } from '../lib/snackbar';
import { MythicDialog } from './MythicDialog';
import { MythicSelectFromListDialog } from './MythicSelectFromListDialog';
import { MythicConfirmDialog } from './MythicConfirmDialog';
import { TaskParametersDialog } from './TaskParametersDialog';
import { createTaskingMutation } from './CallbackMutations';

// ── GraphQL ───────────────────────────────────────────────────────

const getLoadedCommandsBasedOnInput = ({ cmd, ui_feature }: { cmd?: string; ui_feature?: string }) => {
  let filterStr = '{command: {id: {_eq: 0}}}';
  if (cmd !== undefined && cmd !== '') filterStr = '{command: {cmd: {_eq: $cmd}}}';
  else if (ui_feature !== undefined && ui_feature !== '') filterStr = '{command: {supported_ui_features: {_contains: $ui_feature}}}';
  return gql`
    query GetLoadedCommandsQuery($callback_id: Int!, $ui_feature: jsonb, $cmd: String) {
      callback_by_pk(id: $callback_id) {
        operation_id id display_id active
        payload { payloadtype { id } }
        loadedcommands(where: ${filterStr}) {
          id
          command {
            cmd help_cmd description id needs_admin payload_type_id
            payloadtype { name }
            attributes
            commandparameters { id type }
            supported_ui_features
          }
        }
        callbacktokens(where: { deleted: { _eq: false } }) {
          token { token_id id user description }
          id
        }
      }
    }
  `;
};

const getAvailableCallbacksWithUIFeature = gql`
  query getAvailableCallbacksWithUIFeature($ui_feature: jsonb!) {
    loadedcommands(where: { callback: { active: { _eq: true } }, command: { supported_ui_features: { _contains: $ui_feature } } }) {
      id
      callback {
        id display_id user host description
        payload { id payloadtype { name id } }
      }
    }
  }
`;

// ── Types ─────────────────────────────────────────────────────────

interface TaskFromUIButtonProps {
  callback_id?: number;
  callback_ids?: number[];
  cmd?: string;
  ui_feature?: string;
  parameters?: any;
  onTasked: (result: { tasked: boolean; variables?: any }) => void;
  tasking_location?: string;
  getConfirmation?: boolean;
  openDialog?: boolean;
  acceptText?: string;
  dontShowSuccessDialog?: boolean;
  token?: any;
  selectCallback?: boolean;
}

// ── Component ─────────────────────────────────────────────────────

export const TaskFromUIButton: React.FC<TaskFromUIButtonProps> = ({
  callback_id, callback_ids, cmd, ui_feature, parameters, onTasked,
  tasking_location, getConfirmation, openDialog, acceptText,
  dontShowSuccessDialog, token, selectCallback,
}) => {
  const [fileBrowserCommands, setFileBrowserCommands] = useState<any[]>([]);
  const [openSelectCommandDialog, setOpenSelectCommandDialog] = useState(false);
  const [openParametersDialog, setOpenParametersDialog] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<any>({});
  const [callbackTokenOptions, setCallbackTokenOptions] = useState<any[]>([]);
  const [selectedCallbackToken, setSelectedCallbackToken] = useState<any>({});
  const [openCallbackTokenSelectDialog, setOpenCallbackTokenSelectDialog] = useState(false);
  const [taskingVariables, setTaskingVariables] = useState<any>({});
  const [openConfirmDialog, setOpenConfirmDialog] = useState(false);
  const savedFinalVariables = useRef<any>({});
  const [openSelectCallback, setOpenSelectCallback] = useState(false);
  const [callbackOptions, setCallbackOptions] = useState<any[]>([]);
  const [callbackData, setCallbackData] = useState<any>({});

  const renderValue = (val: any): string => {
    if (val === 'Default Token') return 'Default Token';
    if (val.user === null || val.user === undefined) return val.description === null ? val.token_id + ' - No Description' : val.token_id + ' - ' + val.description;
    return val.description === null ? val.token_id + ' - ' + val.user : val.token_id + ' - ' + val.user + ' - ' + val.description;
  };

  const [getCallbackData] = useLazyQuery(getLoadedCommandsBasedOnInput({ cmd, ui_feature }), {
    onCompleted: (data: any) => {
      setCallbackData(data);
      if (data.callback_by_pk === null) { snackActions.warning('Unknown callback'); onTasked({ tasked: false }); return; }
      if (!data.callback_by_pk.active) { snackActions.warning("Callback isn't active"); onTasked({ tasked: false }); return; }
      let available = data.callback_by_pk.loadedcommands.reduce((prev: any[], cur: any) => {
        return [...prev, { ...cur.command, parsedParameters: typeof parameters === 'string' ? {} : (parameters ?? {}) }];
      }, []);
      const availableTokens = data.callback_by_pk.callbacktokens.reduce((prev: any[], cur: any) => [...prev, { ...cur.token, display: renderValue(cur.token) }], []);
      setCallbackTokenOptions(availableTokens);
      available = available.map((c: any) => ({ ...c, display: `${c.cmd} ( ${c.payloadtype.name} )` }));
      setFileBrowserCommands(available);
      if (available.length === 0) {
        snackActions.warning(ui_feature !== undefined ? 'No commands currently loaded that support the ' + ui_feature + ' feature' : 'No commands currently loaded that by the name ' + cmd);
        onTasked({ tasked: false });
      } else if (available.length === 1) {
        setSelectedCommand({ ...available[0] });
      } else {
        setSelectedCommand({}); setOpenSelectCommandDialog(true);
      }
    },
    fetchPolicy: 'no-cache',
  });

  const [getCallbacks] = useLazyQuery(getAvailableCallbacksWithUIFeature, {
    onCompleted: (data: any) => {
      const opts = data.loadedcommands.reduce((prev: any[], cur: any) => {
        if (prev.findIndex((c: any) => c.id === cur.callback.id) > -1) return prev;
        return [...prev, { ...cur.callback, display: `${cur.callback.display_id} - ${cur.callback.payload.payloadtype.name} - ${cur.callback.user} - ${cur.callback.host} - ${cur.callback.description}` }];
      }, []);
      if (opts.length === 0) { snackActions.warning('No commands currently loaded that support the ' + ui_feature + ' feature'); onTasked({ tasked: false }); return; }
      opts.sort((a: any, b: any) => a.id < b.id ? 1 : -1);
      setCallbackOptions(opts); setOpenSelectCallback(true);
    },
  });

  const [createTask] = useMutation(createTaskingMutation, {
    update: (_cache: any, { data }: any) => {
      if (data.createTask.status === 'error') { snackActions.error(data.createTask.error); onTasked({ tasked: false }); return; }
      if (dontShowSuccessDialog) { onTasked({ tasked: true, variables: savedFinalVariables.current }); return; }
      if (callback_ids === undefined) {
        snackActions.success('Issued "' + selectedCommand['cmd'] + '" to Callback ' + callbackData.callback_by_pk.display_id);
      } else {
        snackActions.success('Issued "' + selectedCommand['cmd'] + '" to ' + callback_ids.length + ' callbacks.\nThis might take a while to process.');
      }
      onTasked({ tasked: true, variables: savedFinalVariables.current });
    },
    onError: () => onTasked({ tasked: false }),
  });

  const onSubmitSelectedCommand = (cmd_item: any) => { setOpenSelectCommandDialog(false); setSelectedCommand(cmd_item); };

  const onSubmitTasking = ({ variables }: { variables: any }) => {
    if (getConfirmation) { setTaskingVariables(variables); setOpenConfirmDialog(true); return; }
    if (callbackTokenOptions.length > 0) {
      setTaskingVariables(variables);
      if (token) setSelectedCallbackToken(token);
      else setOpenCallbackTokenSelectDialog(true);
    } else if (callback_ids) {
      createTask({ variables: { ...variables, callback_ids } });
    } else {
      createTask({ variables: { ...variables, callback_id: callbackData.callback_by_pk.display_id } });
    }
  };

  const submitParametersDialog = (cmdName: string, new_parameters: string, files: string[], selectedParameterGroup: string, payload_type: string) => {
    setOpenParametersDialog(false);
    try {
      savedFinalVariables.current = JSON.parse(new_parameters);
      if (typeof parameters !== 'string' && parameters) {
        savedFinalVariables.current = { ...parameters, ...savedFinalVariables.current };
        new_parameters = JSON.stringify(savedFinalVariables.current);
      }
    } catch { savedFinalVariables.current = new_parameters; }
    onSubmitTasking({
      variables: {
        callback_id: callbackData.callback_by_pk.display_id, command: cmdName,
        params: new_parameters, files, tasking_location: 'modal',
        payload_type, parameter_group_name: selectedParameterGroup,
      },
    });
  };

  const onSubmitSelectedToken = (tok: any) => setSelectedCallbackToken(tok);

  const onSubmitConfirm = () => {
    if (callbackTokenOptions.length > 0) setOpenCallbackTokenSelectDialog(true);
    else if (callback_ids) createTask({ variables: { ...taskingVariables, callback_ids } });
    else createTask({ variables: { ...taskingVariables, callback_id: callbackData.callback_by_pk.display_id } });
    setOpenConfirmDialog(false);
  };

  const onSubmitSelectedCallback = (cb: any) => {
    setOpenSelectCallback(false);
    getCallbackData({ variables: { callback_id: cb.id, ui_feature, cmd } });
  };

  // ── Init ────────────────────────────────────────────────────────

  useEffect(() => {
    if (selectCallback) getCallbacks({ variables: { ui_feature } });
    else getCallbackData({ variables: { callback_id, ui_feature, cmd } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Token selection effect ──────────────────────────────────────

  useEffect(() => {
    if (selectedCallbackToken === '' || selectedCallbackToken === 'Default Token') {
      if (callback_ids) createTask({ variables: { ...taskingVariables, callback_ids } });
      else createTask({ variables: { ...taskingVariables, callback_id: callbackData?.callback_by_pk?.display_id } });
    }
    if (selectedCallbackToken?.token_id) {
      if (callback_ids) createTask({ variables: { ...taskingVariables, callback_ids, token_id: selectedCallbackToken.token_id } });
      else createTask({ variables: { ...taskingVariables, callback_id: callbackData?.callback_by_pk?.display_id, token_id: selectedCallbackToken.token_id } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCallbackToken]);

  // ── Command selection effect ────────────────────────────────────

  useEffect(() => {
    if (selectedCommand.commandparameters === undefined) return;
    if (openDialog && selectedCommand.commandparameters.length > 0) { setOpenParametersDialog(true); return; }
    const taskingLoc = tasking_location ?? 'browserscript';
    if (selectedCommand.commandparameters.length > 0) {
      if (parameters === undefined || parameters === null) {
        setOpenParametersDialog(true);
      } else {
        savedFinalVariables.current = parameters;
        const paramStr = typeof parameters === 'string' ? parameters : JSON.stringify(parameters);
        const loc = typeof parameters === 'string' ? 'command_line' : taskingLoc;
        onSubmitTasking({
          variables: { callback_id: callbackData.callback_by_pk.display_id, command: selectedCommand.cmd, params: paramStr, payload_type: selectedCommand?.payloadtype?.name, tasking_location: loc },
        });
      }
    } else {
      if (parameters === undefined || parameters === null) {
        savedFinalVariables.current = '';
        onSubmitTasking({ variables: { callback_id: callbackData.callback_by_pk.display_id, command: selectedCommand.cmd, payload_type: selectedCommand?.payloadtype?.name, params: '' } });
      } else {
        savedFinalVariables.current = parameters;
        const paramStr = typeof parameters === 'string' ? parameters : JSON.stringify(parameters);
        const loc = typeof parameters === 'string' ? 'command_line' : taskingLoc;
        onSubmitTasking({ variables: { callback_id: callbackData.callback_by_pk.display_id, command: selectedCommand.cmd, payload_type: selectedCommand?.payloadtype?.name, params: paramStr, tasking_location: loc } });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommand]);

  // ── Render ──────────────────────────────────────────────────────

  const closeTrigger = () => onTasked({ tasked: false });

  return (
    <div>
      {openSelectCommandDialog && (
        <MythicDialog fullWidth maxWidth="md" open={openSelectCommandDialog}
          onClose={() => { setOpenSelectCommandDialog(false); closeTrigger(); }}
          innerDialog={<MythicSelectFromListDialog onClose={() => { setOpenSelectCommandDialog(false); closeTrigger(); }}
            onSubmit={onSubmitSelectedCommand} options={fileBrowserCommands} title="Select Command"
            action="select" identifier="id" display="display" dontCloseOnSubmit />} />
      )}
      {openSelectCallback && (
        <MythicDialog fullWidth maxWidth="md" open={openSelectCallback}
          onClose={() => { setOpenSelectCallback(false); closeTrigger(); }}
          innerDialog={<MythicSelectFromListDialog onClose={() => { setOpenSelectCallback(false); closeTrigger(); }}
            onSubmit={onSubmitSelectedCallback} options={callbackOptions} title="Select Callback"
            action="select" identifier="id" display="display" dontCloseOnSubmit />} />
      )}
      {openParametersDialog && (
        <MythicDialog fullWidth maxWidth="lg" open={openParametersDialog}
          onClose={() => { setOpenParametersDialog(false); closeTrigger(); }}
          innerDialog={<TaskParametersDialog command={selectedCommand} callback_id={callbackData.callback_by_pk.id}
            payloadtype_id={callbackData.callback_by_pk.payload.payloadtype.id}
            operation_id={callbackData.callback_by_pk.operation_id}
            onSubmit={submitParametersDialog} onClose={() => { setOpenParametersDialog(false); closeTrigger(); }} />} />
      )}
      {openCallbackTokenSelectDialog && (
        <MythicDialog fullWidth maxWidth="lg" open={openCallbackTokenSelectDialog}
          onClose={() => { setOpenCallbackTokenSelectDialog(false); closeTrigger(); }}
          innerDialog={<MythicSelectFromListDialog onClose={() => { setOpenCallbackTokenSelectDialog(false); closeTrigger(); }}
            onSubmit={onSubmitSelectedToken} dontCloseOnSubmit options={callbackTokenOptions} title="Select Token"
            action="select" identifier="id" display="display" />} />
      )}
      {openConfirmDialog && (
        <MythicConfirmDialog onClose={() => { setOpenConfirmDialog(false); closeTrigger(); }} dontCloseOnSubmit
          onSubmit={onSubmitConfirm} open={openConfirmDialog} acceptText={acceptText} />
      )}
    </div>
  );
};
