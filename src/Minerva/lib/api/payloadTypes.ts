import { gql } from '@apollo/client';

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

export const TOGGLE_CONSUMING_DELETE = gql`
  mutation ToggleConsumingDelete($id: Int!, $deleted: Boolean!) {
    update_consumingcontainer_by_pk(pk_columns: {id: $id}, _set: {deleted: $deleted}) { id deleted }
  }
`;

export const TEST_WEBHOOK = gql`
  mutation TestWebhook($service_type: String!) {
    consumingServicesTestWebhook(service_type: $service_type) { status error }
  }
`;

export const TEST_LOG = gql`
  mutation TestLog($service_type: String!) {
    consumingServicesTestLog(service_type: $service_type) { status error }
  }
`;

// ─── Tag Import/Export ───────────────────────────────────
