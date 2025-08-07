/**
 * Unified Project Management Interface Architecture
 * 
 * This module defines the core abstractions for unified project management
 * that can work seamlessly with GitHub Projects, Jira, and other platforms.
 */

import { EventEmitter } from 'events';

// ============================================================================
// CORE ENTITY INTERFACES
// ============================================================================

export interface ProjectEntity {
  id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  assignee?: string;
  labels: string[];
  url: string;
  platform: ProjectPlatform;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
}

export interface Project extends ProjectEntity {
  type: ProjectType;
  owner: string;
  members: ProjectMember[];
  boards: Board[];
  workflows: Workflow[];
  settings: ProjectSettings;
  visibility: 'public' | 'private' | 'internal';
}

export interface Issue extends ProjectEntity {
  project: string; // Project ID
  board?: string; // Board ID
  type: IssueType;
  reporter: string;
  comments: Comment[];
  attachments: Attachment[];
  parent?: string; // Parent issue ID for subtasks
  children: string[]; // Child issue IDs
  epic?: string; // Epic ID (Jira) or Project ID (GitHub)
  sprint?: string; // Sprint ID
  storyPoints?: number;
  timeTracking?: TimeTracking;
  customFields: Record<string, any>;
}

export interface Board extends ProjectEntity {
  project: string; // Project ID
  type: BoardType;
  columns: Column[];
  swimlanes?: Swimlane[];
  filter?: BoardFilter;
  permissions: BoardPermissions;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  rules: WorkflowRule[];
  platform: ProjectPlatform;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// SUPPORTING ENTITY INTERFACES
// ============================================================================

export interface ProjectMember {
  id: string;
  name: string;
  email: string;
  role: ProjectRole;
  permissions: string[];
  avatar?: string;
  status: 'active' | 'inactive' | 'pending';
  joinedAt: Date;
}

export interface Column {
  id: string;
  name: string;
  position: number;
  limit?: number; // WIP limit
  status: string; // Maps to workflow status
  issueTypes: IssueType[];
}

export interface Swimlane {
  id: string;
  name: string;
  query: string;
  position: number;
}

export interface WorkflowStatus {
  id: string;
  name: string;
  category: 'todo' | 'in_progress' | 'done';
  description: string;
  properties: Record<string, any>;
}

export interface WorkflowTransition {
  id: string;
  name: string;
  from: string; // Status ID
  to: string; // Status ID
  conditions: WorkflowCondition[];
  validators: WorkflowValidator[];
  postFunctions: WorkflowPostFunction[];
}

export interface Comment {
  id: string;
  author: string;
  body: string;
  visibility?: CommentVisibility;
  createdAt: Date;
  updatedAt: Date;
}

export interface Attachment {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
}

export interface TimeTracking {
  originalEstimate?: number; // seconds
  remainingEstimate?: number; // seconds
  timeSpent?: number; // seconds
  worklog: WorklogEntry[];
}

export interface WorklogEntry {
  id: string;
  author: string;
  timeSpent: number; // seconds
  comment: string;
  startedAt: Date;
  createdAt: Date;
}

// ============================================================================
// CONFIGURATION AND SETTINGS
// ============================================================================

export interface ProjectSettings {
  defaultAssignee?: string;
  issueTypes: IssueTypeConfig[];
  customFields: CustomFieldConfig[];
  notifications: NotificationConfig;
  automation: AutomationConfig;
  integrations: IntegrationConfig[];
}

export interface IssueTypeConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  hierarchyLevel: number;
  fields: FieldConfig[];
  workflows: string[]; // Workflow IDs
}

export interface CustomFieldConfig {
  id: string;
  name: string;
  type: 'string' | 'number' | 'date' | 'select' | 'multiselect' | 'user' | 'boolean';
  required: boolean;
  options?: string[];
  defaultValue?: any;
  validation?: FieldValidation;
}

export interface FieldConfig {
  id: string;
  name: string;
  required: boolean;
  editable: boolean;
  visible: boolean;
  renderer?: string;
  validator?: string;
}

// ============================================================================
// QUERY AND FILTER INTERFACES
// ============================================================================

export interface ProjectQuery {
  platforms?: ProjectPlatform[];
  types?: ProjectType[];
  statuses?: ProjectStatus[];
  owners?: string[];
  members?: string[];
  labels?: string[];
  created?: DateRange;
  updated?: DateRange;
  search?: string;
  sortBy?: 'name' | 'created' | 'updated' | 'priority';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface IssueQuery {
  projects?: string[];
  boards?: string[];
  types?: IssueType[];
  statuses?: ProjectStatus[];
  assignees?: string[];
  reporters?: string[];
  labels?: string[];
  epics?: string[];
  sprints?: string[];
  created?: DateRange;
  updated?: DateRange;
  search?: string;
  customFields?: Record<string, any>;
  sortBy?: 'created' | 'updated' | 'priority' | 'assignee';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface BoardFilter {
  issueTypes?: IssueType[];
  assignees?: string[];
  labels?: string[];
  query?: string;
}

// ============================================================================
// OPERATION INTERFACES
// ============================================================================

export interface CreateProjectRequest {
  title: string;
  description: string;
  type: ProjectType;
  template?: string;
  visibility: 'public' | 'private' | 'internal';
  settings?: Partial<ProjectSettings>;
  members?: ProjectMember[];
}

export interface UpdateProjectRequest {
  title?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: Priority;
  labels?: string[];
  settings?: Partial<ProjectSettings>;
}

export interface CreateIssueRequest {
  title: string;
  description: string;
  type: IssueType;
  project: string;
  assignee?: string;
  reporter?: string;
  priority?: Priority;
  labels?: string[];
  parent?: string;
  epic?: string;
  sprint?: string;
  storyPoints?: number;
  customFields?: Record<string, any>;
}

export interface UpdateIssueRequest {
  title?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: Priority;
  assignee?: string;
  labels?: string[];
  parent?: string;
  epic?: string;
  sprint?: string;
  storyPoints?: number;
  customFields?: Record<string, any>;
}

export interface BulkOperation<T = any> {
  action: 'update' | 'delete' | 'move' | 'assign';
  targets: string[]; // Entity IDs
  data?: T;
  conditions?: Record<string, any>;
}

// ============================================================================
// AUTHENTICATION INTERFACES
// ============================================================================

export interface AuthConfig {
  platform: ProjectPlatform;
  type: AuthType;
  credentials: AuthCredentials;
  refreshConfig?: RefreshConfig;
  scopes?: string[];
  baseUrl?: string;
}

export interface AuthCredentials {
  token?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  privateKey?: string;
  certificate?: string;
  customFields?: Record<string, any>;
}

export interface RefreshConfig {
  enabled: boolean;
  endpoint?: string;
  refreshToken?: string;
  expirationBuffer: number; // minutes before expiry to refresh
}

// ============================================================================
// EVENT AND WEBHOOK INTERFACES
// ============================================================================

export interface ProjectEvent {
  id: string;
  type: EventType;
  platform: ProjectPlatform;
  timestamp: Date;
  source: EventSource;
  data: any;
  metadata: Record<string, any>;
}

export interface WebhookConfig {
  id: string;
  platform: ProjectPlatform;
  url: string;
  secret?: string;
  events: EventType[];
  filters?: EventFilter[];
  isActive: boolean;
  retryConfig?: RetryConfig;
  headers?: Record<string, string>;
}

export interface EventFilter {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'regex';
  value: any;
}

export interface RetryConfig {
  maxRetries: number;
  backoffMultiplier: number;
  maxBackoffTime: number; // milliseconds
}

// ============================================================================
// PLATFORM ADAPTER INTERFACES
// ============================================================================

export interface PlatformAdapter {
  readonly platform: ProjectPlatform;
  readonly name: string;
  readonly version: string;
  readonly capabilities: PlatformCapabilities;

  // Connection Management
  connect(config: AuthConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  testConnection(): Promise<boolean>;

  // Project Operations
  createProject(request: CreateProjectRequest): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  updateProject(id: string, request: UpdateProjectRequest): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  listProjects(query?: ProjectQuery): Promise<Project[]>;

  // Issue Operations
  createIssue(request: CreateIssueRequest): Promise<Issue>;
  getIssue(id: string): Promise<Issue | null>;
  updateIssue(id: string, request: UpdateIssueRequest): Promise<Issue>;
  deleteIssue(id: string): Promise<void>;
  listIssues(query?: IssueQuery): Promise<Issue[]>;

  // Board Operations
  getBoard(id: string): Promise<Board | null>;
  listBoards(projectId?: string): Promise<Board[]>;
  createBoard?(request: CreateBoardRequest): Promise<Board>;
  updateBoard?(id: string, request: UpdateBoardRequest): Promise<Board>;

  // Bulk Operations
  bulkUpdateIssues(operation: BulkOperation<UpdateIssueRequest>): Promise<Issue[]>;
  bulkDeleteIssues(issueIds: string[]): Promise<void>;

  // Search and Query
  searchIssues(query: string, filters?: Record<string, any>): Promise<Issue[]>;
  searchProjects(query: string, filters?: Record<string, any>): Promise<Project[]>;

  // Workflow Operations
  getWorkflows(projectId?: string): Promise<Workflow[]>;
  transitionIssue(issueId: string, transitionId: string, data?: any): Promise<Issue>;

  // Attachment Operations
  addAttachment?(issueId: string, file: File | Buffer, filename: string): Promise<Attachment>;
  getAttachment?(id: string): Promise<Buffer>;
  deleteAttachment?(id: string): Promise<void>;

  // Comment Operations
  addComment(issueId: string, body: string, visibility?: CommentVisibility): Promise<Comment>;
  updateComment(commentId: string, body: string): Promise<Comment>;
  deleteComment(commentId: string): Promise<void>;

  // Event Handling
  registerWebhook?(config: WebhookConfig): Promise<string>;
  unregisterWebhook?(id: string): Promise<void>;
  handleWebhookEvent?(event: any): Promise<ProjectEvent>;

  // Platform-specific Operations
  executeCustomOperation?(operation: string, data: any): Promise<any>;
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type ProjectPlatform = 'github' | 'jira' | 'azure-devops' | 'linear' | 'asana' | 'custom';

export type ProjectType = 'software' | 'business' | 'personal' | 'template' | 'kanban' | 'scrum' | 'custom';

export type ProjectStatus = 
  | 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled' | 'archived'
  | 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'blocked'
  | 'open' | 'closed' | 'resolved' | 'reopened';

export type IssueType = 
  | 'task' | 'bug' | 'feature' | 'epic' | 'story' | 'subtask'
  | 'improvement' | 'research' | 'spike' | 'test' | 'documentation';

export type Priority = 'lowest' | 'low' | 'medium' | 'high' | 'highest' | 'critical';

export type ProjectRole = 'owner' | 'admin' | 'maintainer' | 'developer' | 'reporter' | 'viewer';

export type BoardType = 'kanban' | 'scrum' | 'list' | 'calendar' | 'roadmap' | 'custom';

export type AuthType = 'token' | 'oauth' | 'basic' | 'app' | 'certificate' | 'custom';

export type EventType = 
  | 'project.created' | 'project.updated' | 'project.deleted'
  | 'issue.created' | 'issue.updated' | 'issue.deleted' | 'issue.transitioned'
  | 'comment.created' | 'comment.updated' | 'comment.deleted'
  | 'attachment.added' | 'attachment.removed'
  | 'member.added' | 'member.removed' | 'member.role_changed'
  | 'workflow.updated' | 'board.updated'
  | 'custom';

export type EventSource = {
  type: 'webhook' | 'polling' | 'api' | 'manual';
  id: string;
  name: string;
};

export type CommentVisibility = {
  type: 'public' | 'internal' | 'restricted';
  restrictedTo?: string[]; // User/group IDs
};

export type DateRange = {
  start?: Date;
  end?: Date;
};

// ============================================================================
// CAPABILITY INTERFACES
// ============================================================================

export interface PlatformCapabilities {
  projects: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    list: boolean;
    search: boolean;
  };
  issues: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    list: boolean;
    search: boolean;
    bulk: boolean;
    hierarchy: boolean; // Parent/child relationships
    links: boolean; // Issue linking
    timeTracking: boolean;
    customFields: boolean;
  };
  boards: {
    read: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
    customColumns: boolean;
    swimlanes: boolean;
    filters: boolean;
  };
  workflows: {
    read: boolean;
    create: boolean;
    update: boolean;
    transition: boolean;
    customStatuses: boolean;
    conditions: boolean;
    validators: boolean;
  };
  attachments: {
    upload: boolean;
    download: boolean;
    delete: boolean;
    maxSize: number; // bytes
    allowedTypes: string[];
  };
  comments: {
    create: boolean;
    update: boolean;
    delete: boolean;
    visibility: boolean;
    mentions: boolean;
  };
  webhooks: {
    register: boolean;
    unregister: boolean;
    events: EventType[];
    customEvents: boolean;
  };
  search: {
    projects: boolean;
    issues: boolean;
    customQuery: boolean;
    savedQueries: boolean;
  };
  authentication: {
    types: AuthType[];
    scopes: string[];
    refreshSupported: boolean;
  };
}

// ============================================================================
// UTILITY INTERFACES
// ============================================================================

export interface CreateBoardRequest {
  name: string;
  description: string;
  project: string;
  type: BoardType;
  template?: string;
  columns?: Partial<Column>[];
  permissions?: BoardPermissions;
}

export interface UpdateBoardRequest {
  name?: string;
  description?: string;
  columns?: Partial<Column>[];
  filter?: BoardFilter;
  permissions?: BoardPermissions;
}

export interface BoardPermissions {
  view: string[]; // User/group IDs
  edit: string[]; // User/group IDs
  admin: string[]; // User/group IDs
}

export interface WorkflowCondition {
  type: string;
  configuration: Record<string, any>;
}

export interface WorkflowValidator {
  type: string;
  configuration: Record<string, any>;
}

export interface WorkflowPostFunction {
  type: string;
  configuration: Record<string, any>;
}

export interface WorkflowRule {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  conditions: WorkflowCondition[];
  actions: WorkflowPostFunction[];
  isActive: boolean;
}

export interface NotificationConfig {
  email: {
    enabled: boolean;
    events: EventType[];
    recipients: string[];
  };
  webhook: {
    enabled: boolean;
    events: EventType[];
    urls: string[];
  };
  inApp: {
    enabled: boolean;
    events: EventType[];
  };
}

export interface AutomationConfig {
  rules: AutomationRule[];
  templates: AutomationTemplate[];
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  isActive: boolean;
}

export interface AutomationTrigger {
  type: EventType;
  filters?: Record<string, any>;
}

export interface AutomationCondition {
  field: string;
  operator: string;
  value: any;
}

export interface AutomationAction {
  type: string;
  configuration: Record<string, any>;
}

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  rules: Omit<AutomationRule, 'id'>[];
  category: string;
}

export interface IntegrationConfig {
  id: string;
  platform: string;
  type: string;
  configuration: Record<string, any>;
  isActive: boolean;
}

export interface FieldValidation {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  required?: boolean;
  customValidator?: string;
}