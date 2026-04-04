// ═══════════════════════════════════════════════════════════════════
//  EventTriggerContextSelect — trigger-a-workflow dialog
//  (Minerva-native – replaces Legacy Eventing/EventTriggerContextSelect)
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useCallback } from 'react';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { useQueryCompat as useQuery } from '../lib/useQueryCompat';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import { snackActions } from '../lib/snackbar';
import MythicStyledTableCell from './MythicTableCell';

// ── GraphQL ───────────────────────────────────────────────────────

const TRIGGER_MANUAL = gql`
  mutation TriggerManual($eventgroup_id: Int!, $env_data: jsonb) {
    eventingTriggerManual(eventgroup_id: $eventgroup_id, env_data: $env_data) {
      status
      error
    }
  }
`;

const TRIGGER_MANUAL_BULK = gql`
  mutation TriggerManualBulk(
    $eventgroup_id: Int!
    $env_data: jsonb
    $trigger_context_type: String!
    $trigger_context_ids: [Int!]!
  ) {
    eventingTriggerManualBulk(
      eventgroup_id: $eventgroup_id
      env_data: $env_data
      trigger_context_type: $trigger_context_type
      trigger_context_ids: $trigger_context_ids
    ) {
      status
      error
    }
  }
`;

const GET_ACTIVE_WORKFLOWS = gql`
  query GetActiveWorkflows {
    eventgroup(
      where: { deleted: { _eq: false }, active: { _eq: true }, approved_to_run: { _eq: true } }
      order_by: { id: desc }
    ) {
      id
      name
      description
      trigger
      trigger_data
      keywords
      environment
      active
      operator { username }
    }
  }
`;

// ── Types ─────────────────────────────────────────────────────────

interface TriggerContext {
  name?: string;
  value?: any;
  trigger_context_type?: string;
  trigger_context_ids?: number[];
}

interface EventTriggerContextSelectProps {
  onClose: () => void;
  triggerContext: TriggerContext;
}

interface EnvRow {
  type: 'text' | 'number';
  key: string;
  value: string;
}

interface Workflow {
  id: number;
  name: string;
  description: string;
  trigger: string;
  trigger_data: any;
  keywords: any;
  environment: any;
  active: boolean;
  operator: { username: string };
}

const TYPE_OPTIONS = ['text', 'number'] as const;

// ── Component ─────────────────────────────────────────────────────

export function EventTriggerContextSelectDialog({ onClose, triggerContext }: EventTriggerContextSelectProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selected, setSelected] = useState<Workflow>({ id: 0 } as Workflow);
  const [envData, setEnvData] = useState<EnvRow[]>([]);

  useQuery(GET_ACTIVE_WORKFLOWS, {
    fetchPolicy: 'no-cache',
    onCompleted: (data: any) => {
      const items: Workflow[] = data.eventgroup ?? [];
      setWorkflows(items);
      if (items.length > 0) setSelected(items[0]);
    },
    onError: (err: any) => console.error('Failed to load workflows', err),
  });

  const [triggerManual] = useMutation(TRIGGER_MANUAL, {
    onCompleted: (data: any) => {
      if (data.eventingTriggerManual.status === 'success') {
        snackActions.success('Successfully initiated trigger');
        onClose();
      } else {
        snackActions.error(data.eventingTriggerManual.error);
      }
    },
    onError: (err: any) => console.error('triggerManual failed', err),
  });

  const [triggerManualBulk] = useMutation(TRIGGER_MANUAL_BULK, {
    onCompleted: (data: any) => {
      if (data.eventingTriggerManualBulk.status === 'success') {
        snackActions.success('Successfully initiated trigger');
        onClose();
      } else {
        snackActions.error(data.eventingTriggerManualBulk.error);
      }
    },
    onError: (err: any) => console.error('triggerManualBulk failed', err),
  });

  // ── Row helpers ────────────────────────────────────────────────

  const addRow = useCallback(() => {
    setEnvData(prev => [...prev, { type: 'text', key: '', value: '' }]);
  }, []);

  const removeRow = useCallback((idx: number) => {
    setEnvData(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateRow = useCallback((idx: number, patch: Partial<EnvRow>) => {
    setEnvData(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);

  const changeRowType = useCallback((idx: number, type: EnvRow['type']) => {
    setEnvData(prev =>
      prev.map((r, i) => (i === idx ? { ...r, type, value: type === 'number' ? '0' : '' } : r)),
    );
  }, []);

  // ── Submit ─────────────────────────────────────────────────────

  const onSubmit = useCallback(() => {
    const envMap = envData.reduce<Record<string, string | number>>((acc, row) => {
      acc[row.key] = row.type === 'number' ? parseInt(row.value, 10) || 0 : row.value;
      return acc;
    }, {});

    if (triggerContext.name !== undefined) {
      envMap[triggerContext.name] = triggerContext.value;
      triggerManual({ variables: { eventgroup_id: selected.id, env_data: envMap } });
    } else if (triggerContext.trigger_context_type !== undefined) {
      triggerManualBulk({
        variables: {
          eventgroup_id: selected.id,
          env_data: envMap,
          trigger_context_type: triggerContext.trigger_context_type,
          trigger_context_ids: triggerContext.trigger_context_ids,
        },
      });
    } else {
      snackActions.error("No trigger context name or type, can't submit");
    }
  }, [envData, selected, triggerContext, triggerManual, triggerManualBulk]);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <>
      <DialogContent dividers style={{ maxHeight: 'calc(70vh)' }}>
        <DialogContentText>
          Trigger a workflow with selected context and optional additional data.
        </DialogContentText>
        <Select
          style={{ marginBottom: 10, width: '100%' }}
          value={selected}
          onChange={(e) => setSelected(e.target.value as Workflow)}
        >
          {workflows.map(w => (
            <MenuItem key={w.id} value={w as any}>{w.name} - {w.description}</MenuItem>
          ))}
        </Select>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell style={{ width: '50%' }}>Key</TableCell>
              <TableCell>Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {envData.map((row, idx) => (
              <TableRow key={`env-${idx}`}>
                <MythicStyledTableCell style={{ display: 'flex' }}>
                  <IconButton color="error" onClick={() => removeRow(idx)} size="small">
                    <DeleteIcon />
                  </IconButton>
                  <Select
                    value={row.type}
                    onChange={(e) => changeRowType(idx, e.target.value as EnvRow['type'])}
                    size="small"
                  >
                    {TYPE_OPTIONS.map(t => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                  </Select>
                  <TextField
                    value={row.key}
                    onChange={(e) => updateRow(idx, { key: e.target.value })}
                    style={{ width: '100%' }}
                    size="small"
                  />
                </MythicStyledTableCell>
                <MythicStyledTableCell>
                  <TextField
                    value={row.value}
                    onChange={(e) => updateRow(idx, { value: e.target.value })}
                    style={{ width: '100%' }}
                    size="small"
                  />
                </MythicStyledTableCell>
              </TableRow>
            ))}
            <TableRow>
              <MythicStyledTableCell>
                <Button onClick={addRow} color="success">Add Entry</Button>
              </MythicStyledTableCell>
              <MythicStyledTableCell />
            </TableRow>
          </TableBody>
        </Table>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="contained" color="primary">Close</Button>
        <Button onClick={onSubmit} variant="contained" color="success">Submit</Button>
      </DialogActions>
    </>
  );
}
