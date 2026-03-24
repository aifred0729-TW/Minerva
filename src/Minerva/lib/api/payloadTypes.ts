import { gql } from '@apollo/client';

export const GET_PAYLOAD_TYPES_FULL = gql`
  query GetPayloadTypesFull {
    payloadtype(where: {deleted: {_eq: false}}, order_by: {name: asc}) {
      id
      name
      agent_type
      author
      note
      container_running
      supported_os
      supports_dynamic_loading
      deleted
      translation_container { id name container_running }
      commands(where: {deleted: {_eq: false}}, order_by: {cmd: asc}) {
        id
        cmd
        description
        needs_admin
        supported_ui_features
        version
      }
    }
    consumingcontainer(where: {deleted: {_eq: false}}, order_by: {name: asc}) {
      id
      name
      container_running
      subscriptions
      description
      type
      deleted
    }
    translationcontainer(where: {deleted: {_eq: false}}, order_by: {name: asc}) {
      id
      name
      container_running
      note
      deleted
      supported_payloadtypes { id name }
    }
    custombrowser(where: {deleted: {_eq: false}}, order_by: {name: asc}) {
      id
      name
      description
      container_running
      deleted
    }
  }
`;

export const SUB_PAYLOAD_TYPES = gql`
  subscription SubPayloadTypes {
    payloadtype(order_by: {name: asc}) {
      id
      name
      agent_type
      author
      note
      container_running
      supported_os
      supports_dynamic_loading
      deleted
      semver
      translation_container { id name container_running }
      wrap_these_payload_types {
        id
        wrapped { name }
      }
      commands(where: {deleted: {_eq: false}}, order_by: {cmd: asc}) {
        id
        cmd
        description
        needs_admin
        supported_ui_features
        version
      }
    }
  }
`;

export const SUB_CONSUMING_CONTAINERS = gql`
  subscription SubConsumingContainers {
    consumingcontainer(order_by: {name: asc}) {
      id
      name
      container_running
      subscriptions
      description
      type
      deleted
      semver
    }
  }
`;

export const SUB_TRANSLATION_CONTAINERS = gql`
  subscription SubTranslationContainers {
    translationcontainer(order_by: {name: asc}) {
      id
      name
      container_running
      note
      deleted
      description
      author
      semver
      payloadtypes(order_by: {name: asc}) {
        name
        deleted
        id
      }
    }
  }
`;

export const SUB_CUSTOM_BROWSERS = gql`
  subscription SubCustomBrowsers {
    custombrowser(order_by: {name: asc}) {
      id
      name
      description
      container_running
      deleted
      author
      semver
    }
  }
`;

// ─── Single task view ─────────────────────────────────────

export const GET_ALL_PAYLOAD_TYPES_NAMES = gql`
  query GetAllPayloadTypeNames {
    payloadtype(where: {wrapper: {_eq: false}}, order_by: {name: asc}) {
      name
    }
  }
`;

// ─── Tag Import/Export ───────────────────────────────────
