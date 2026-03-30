import { gql } from '@apollo/client';

export const GET_MITRE_ATTACKS = gql`
  query GetMitreAttack {
    attack(order_by: {t_num: asc}) {
      id
      name
      t_num
      os
      tactic
    }
  }
`;

export const GET_MITRE_TASK_ATTACKS = gql`
  query GetMitreTaskAttacks($operation_id: Int!) {
    attacktask(where: {task: {callback: {operation_id: {_eq: $operation_id}}}}) {
      attack_id
      task {
        id
        command_name
        comment
        display_params
        callback { id payload { payloadtype { name } } }
      }
    }
  }
`;

export const GET_MITRE_TASK_ATTACKS_FILTERED = gql`
  query GetMitreTaskAttacksFiltered($operation_id: Int!, $payload_type: String!) {
    attacktask(where: {task: {callback: {operation_id: {_eq: $operation_id}, payload: {payloadtype: {name: {_eq: $payload_type}}}}}}) {
      attack_id
      task {
        id
        command_name
        comment
        display_params
        callback { id payload { payloadtype { name } } }
      }
    }
  }
`;

export const GET_MITRE_TASK_ATTACKS_BY_TAGS = gql`
  query GetMitreTaskAttacksByTags($tasks: [Int!]!) {
    attacktask(where: {task_id: {_in: $tasks}}) {
      attack_id
      task {
        id
        command_name
        comment
        display_params
        callback { id payload { payloadtype { name } } }
      }
    }
  }
`;

export const GET_MITRE_COMMAND_ATTACKS = gql`
  query GetMitreCommandAttacks {
    attackcommand {
      attack_id
      command { cmd payloadtype { name } }
    }
  }
`;

export const GET_MITRE_COMMAND_ATTACKS_FILTERED = gql`
  query GetMitreCommandAttacksFiltered($payload_type: String!) {
    attackcommand(where: {command: {payloadtype: {name: {_eq: $payload_type}}}}) {
      attack_id
      command { cmd payloadtype { name } }
    }
  }
`;

export const GET_TASK_TAGS_FOR_MITRE = gql`
  query GetTaskTagsForMitre {
    tag(where: {task_id: {_is_null: false}}) {
      id
      tagtype { name }
      task_id
    }
  }
`;

// ============================================
// MitreAttack.tsx page queries
// ============================================
export const GET_MITRE_ATTACK = gql`
  query GetMitreAttack {
    attack(order_by: {t_num: asc}) {
      id
      name
      t_num
      os
      tactic
    }
  }
`;

export const GET_TASK_ATTACKS = gql`
  query GetMitreTaskAttack($operation_id: Int!) {
    attacktask(where: {task: {callback: {operation_id: {_eq: $operation_id}}}}) {
      attack_id
      task {
        id
        command_name
        comment
        display_params
        callback {
          id
          display_id
          payload {
            payloadtype {
              name
            }
          }
        }
      }
    }
  }
`;

export const GET_TASK_ATTACKS_FILTERED = gql`
  query GetMitreTaskAttackFiltered($operation_id: Int!, $payload_type: String!) {
    attacktask(where: {task: {callback: {operation_id: {_eq: $operation_id}, payload: {payloadtype: {name: {_eq: $payload_type}}}}}}) {
      attack_id
      task {
        id
        command_name
        comment
        display_params
        callback {
          id
          display_id
          payload {
            payloadtype {
              name
            }
          }
        }
      }
    }
  }
`;

export const GET_COMMAND_ATTACKS = gql`
  query GetMitreCommandAttack {
    attackcommand {
      attack_id
      command {
        cmd
        payloadtype {
          name
        }
      }
    }
  }
`;

export const GET_COMMAND_ATTACKS_FILTERED = gql`
  query GetMitreCommandAttackFiltered($payload_type: String!) {
    attackcommand(where: {command: {payloadtype: {name: {_eq: $payload_type}}}}) {
      attack_id
      command {
        cmd
        payloadtype {
          name
        }
      }
    }
  }
`;

export const GET_TASK_TAGS = gql`
  query GetTaskTags {
    tag(where: {task_id: {_is_null: false}}) {
      id
      tagtype { name }
      task_id
    }
  }
`;

export const GET_TASK_ATTACKS_BY_TAG = gql`
  query GetMitreTaskAttackByTag($tasks: [Int!]!) {
    attacktask(where: {task_id: {_in: $tasks}}) {
      attack_id
      task {
        id
        command_name
        comment
        display_params
        callback {
          id
          display_id
          payload { payloadtype { name } }
        }
      }
    }
  }
`;
