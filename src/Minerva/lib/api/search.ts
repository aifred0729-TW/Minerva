import { gql } from '@apollo/client';

export const SEARCH_TASKS_TAG = gql`
  query SearchTasksByTag($search: String!, $offset: Int!, $limit: Int!){
    tag(where: {tagtype: {name: {_ilike: $search}}, task_id: {_is_null: false}}, order_by: {id: desc}, offset: $offset, limit: $limit) {
      id
      task_id
      data
      tagtype { name color }
      task {
        id display_id command_name display_params status comment
        timestamp
        operator { username }
        callback { id display_id host }
      }
    }
    tag_aggregate(where: {tagtype: {name: {_ilike: $search}}, task_id: {_is_null: false}}) {
      aggregate { count }
    }
  }
`;

export const SEARCH_TASKS_CALLBACK_ID = gql`
  query SearchTasksByCallbackID($search: Int!, $offset: Int!, $limit: Int!){
    task(where: {callback: {display_id: {_eq: $search}}}, order_by: {id: desc}, offset: $offset, limit: $limit) {
      id display_id command_name display_params original_params status comment
      timestamp
      operator { username }
      callback { id display_id host }
    }
    task_aggregate(where: {callback: {display_id: {_eq: $search}}}) {
      aggregate { count }
    }
  }
`;

export const SEARCH_TASKS_CALLBACK_GROUP = gql`
  query SearchTasksByCallbackGroup($search: String!, $offset: Int!, $limit: Int!){
    task(where: {callback: {mythictree_groups: {_contains: [$search]}}}, order_by: {id: desc}, offset: $offset, limit: $limit) {
      id display_id command_name display_params original_params status comment
      timestamp
      operator { username }
      callback { id display_id host }
    }
    task_aggregate(where: {callback: {mythictree_groups: {_contains: [$search]}}}) {
      aggregate { count }
    }
  }
`;

export const SEARCH_CALLBACKS_LAST_CHECKIN = gql`
  query SearchCallbacksByLastCheckin($search: String!, $offset: Int!, $limit: Int!){
    callback(where: {last_checkin: {_gte: $search}, active: {_eq: true}}, order_by: {id: desc}, offset: $offset, limit: $limit) {
      id display_id active host user ip description domain os architecture
      payload { payloadtype { name } }
      last_checkin init_callback pid
    }
    callback_aggregate(where: {last_checkin: {_gte: $search}, active: {_eq: true}}) {
      aggregate { count }
    }
  }
`;

export const SEARCH_CALLBACKS_AGENT = gql`
  query SearchCallbacksByAgent($search: String!, $offset: Int!, $limit: Int!){
    callback(where: {payload: {payloadtype: {name: {_ilike: $search}}}}, order_by: {id: desc}, offset: $offset, limit: $limit) {
      id display_id active host user ip description domain os architecture
      payload { payloadtype { name } }
      last_checkin init_callback pid
    }
    callback_aggregate(where: {payload: {payloadtype: {name: {_ilike: $search}}}}) {
      aggregate { count }
    }
  }
`;

export const SEARCH_CALLBACKS_OS = gql`
  query SearchCallbacksByOS($search: String!, $offset: Int!, $limit: Int!){
    callback(where: {os: {_ilike: $search}}, order_by: {id: desc}, offset: $offset, limit: $limit) {
      id display_id active host user ip description domain os architecture
      payload { payloadtype { name } }
      last_checkin init_callback pid
    }
    callback_aggregate(where: {os: {_ilike: $search}}) {
      aggregate { count }
    }
  }
`;

export const SEARCH_CALLBACKS_ARCH = gql`
  query SearchCallbacksByArch($search: String!, $offset: Int!, $limit: Int!){
    callback(where: {architecture: {_ilike: $search}}, order_by: {id: desc}, offset: $offset, limit: $limit) {
      id display_id active host user ip description domain os architecture
      payload { payloadtype { name } }
      last_checkin init_callback pid
    }
    callback_aggregate(where: {architecture: {_ilike: $search}}) {
      aggregate { count }
    }
  }
`;

// ─── Credential Management from Search ────────────────
