// ═══════════════════════════════════════════════════════════════════
//  TaskTokenDialog — token information viewer dialog
//  (Minerva-native – replaces old pages/Callbacks/TaskTokenDialog)
// ═══════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { gql } from "@apollo/client";
import { useQueryCompat as useQuery } from "../lib/useQueryCompat";
import { snackActions } from '../lib/snackbar';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogTitle from '@mui/material/DialogTitle';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

export const allTokenDataFragment = gql`
    fragment allTokenData on token {
        app_container_sid
        app_container_number
        capabilities
        default_dacl
        groups
        handle
        integrity_level_sid
        logon_sid
        privileges
        restricted
        session_id
        thread_id
        token_id
        user
        task_id
        description
        id
        host
        operation_id
        timestamp
        process_id
    }
`;

const getTokenInfo = gql`
    ${allTokenDataFragment}
    query getTokenInfo($token_id: Int!) {
        token_by_pk(id: $token_id) {
            ...allTokenData
        }
    }
`;

interface TaskTokenDialogProps {
  token_id: number;
  onClose: () => void;
}

export function TaskTokenDialog(props: TaskTokenDialogProps) {
  const [tokenData, setTokenData] = useState<Array<{ name: string; value: any }>>([]);
  const tokenKeys = [
    'app_container_number',
    'app_container_sid',
    'capabilities',
    'default_dacl',
    'groups',
    'handle',
    'integrity_level_sid',
    'logon_sid',
    'privileges',
    'restricted',
    'session_id',
    'thread_id',
    'token_id',
    'user',
    'description',
    'process_id',
  ];

  useQuery<any>(getTokenInfo, {
    variables: { token_id: props.token_id },
    onCompleted: (data: any) => {
      if (data.token_by_pk !== null) {
        const reducedTokenData = tokenKeys.reduce<Array<{ name: string; value: any }>>((prev, key) => {
          if (data.token_by_pk[key] !== undefined && data.token_by_pk[key] !== null && data.token_by_pk[key] !== '') {
            return [...prev, { name: key, value: data.token_by_pk[key] }];
          }
          return prev;
        }, []);
        setTokenData(reducedTokenData);
      }
    },
    onError: (error: any) => {
      snackActions.error(error.message || String(error));
    },
    fetchPolicy: 'network-only',
  });

  return (
    <>
      <DialogTitle id="mythic-draggable-title" style={{ cursor: 'move', width: '100%' }}>
        Token Information
      </DialogTitle>
      <TableContainer className="mythicElement">
        <Table size="small" style={{ tableLayout: 'fixed', maxWidth: 'calc(100vw)', overflow: 'scroll' }}>
          <TableHead>
            <TableRow>
              <TableCell style={{ width: '30%' }}>Token Property</TableCell>
              <TableCell>Token Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tokenData.map((element, index) => (
              <TableRow key={'row' + index} hover>
                <TableCell>{element.name}</TableCell>
                <TableCell>
                  {element.value === true ? 'True' : element.value === false ? 'False' : element.value}
                </TableCell>
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
