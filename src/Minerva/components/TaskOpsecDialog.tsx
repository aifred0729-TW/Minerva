// ═══════════════════════════════════════════════════════════════════
//  TaskOpsecDialog — OPSEC bypass request dialog
//  (Minerva-native – replaces old pages/Callbacks/TaskOpsecDialog)
// ═══════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { useQueryCompat as useQuery } from "../lib/useQueryCompat";
import { snackActions } from '../lib/snackbar';
import { MythicModifyStringDialog } from './MythicDialog';

const updateOpsecRequestMutation = gql`
    mutation requestOpsecBypass($task_id: Int!) {
        requestOpsecBypass(task_id: $task_id) {
            status
            error
        }
    }
`;

const getOpsecQuery = gql`
    query getOPSECQuery($task_id: Int!) {
        task_by_pk(id: $task_id) {
            opsec_pre_blocked
            opsec_pre_message
            opsec_pre_bypassed
            opsec_pre_bypass_role
            opsec_pre_bypass_user {
                username
                id
            }
            opsec_post_blocked
            opsec_post_message
            opsec_post_bypassed
            opsec_post_bypass_role
            opsec_post_bypass_user {
                username
                id
            }
            id
        }
    }
`;

interface TaskOpsecDialogProps {
    task_id: number;
    view: 'pre' | 'post';
    onClose: () => void;
}

export function TaskOpsecDialog(props: TaskOpsecDialogProps) {
    const [opsecMessage, setOpsecMessage] = useState('');
    const [opsecData, setOpsecData] = useState<Record<string, unknown>>({});

    const { error } = useQuery<any>(getOpsecQuery, {
        variables: { task_id: props.task_id },
        onCompleted: (data: any) => {
            setOpsecData(data.task_by_pk);
            if (props.view === 'pre') {
                let message = 'OPSEC PreCheck Message';
                if (data.task_by_pk.opsec_pre_bypass_user !== null) {
                    message += ' (bypassed by ' + data.task_by_pk.opsec_pre_bypass_user.username + ')';
                } else if (data.task_by_pk.opsec_pre_blocked && !data.task_by_pk.opsec_pre_bypassed) {
                    message += ' (required bypass role: ' + data.task_by_pk.opsec_pre_bypass_role + ')';
                }
                message += ':\n\n' + data.task_by_pk.opsec_pre_message + '\n';
                setOpsecMessage(message);
            } else {
                let message = 'OPSEC PostCheck Message';
                if (data.task_by_pk.opsec_post_bypass_user !== null) {
                    message += ' (bypassed by ' + data.task_by_pk.opsec_post_bypass_user.username + ')';
                } else if (data.task_by_pk.opsec_post_blocked && !data.task_by_pk.opsec_post_bypassed) {
                    message += ' (required bypass role: ' + data.task_by_pk.opsec_post_bypass_role + ')';
                }
                message += ':\n\n' + data.task_by_pk.opsec_post_message + '\n';
                setOpsecMessage(message);
            }
        },
        fetchPolicy: 'network-only',
    });

    const [updateOpsecRequest] = useMutation<any>(updateOpsecRequestMutation, {
        update: (_cache: any, { data }: any) => {
            if (data.requestOpsecBypass.status === 'success') {
                snackActions.success('Bypass processed successfully');
            } else {
                snackActions.warning(data.requestOpsecBypass.error);
            }
        },
    });

    if (error) {
        console.error(error);
        return <div>Error! {error.message}</div>;
    }

    const requestAvailable =
        (opsecData.opsec_pre_blocked === true && !opsecData.opsec_pre_bypassed) ||
        (opsecData.opsec_post_blocked === true && !opsecData.opsec_post_bypassed);

    const onRequestSubmit = () => {
        updateOpsecRequest({ variables: { task_id: props.task_id } });
        props.onClose();
    };

    return (
        <MythicModifyStringDialog
            title="Request OPSEC Bypass"
            onClose={props.onClose}
            wrap
            value={opsecMessage}
            onSubmit={requestAvailable ? onRequestSubmit : undefined}
            onSubmitText="Submit Bypass Request"
            dontCloseOnSubmit
        />
    );
}
