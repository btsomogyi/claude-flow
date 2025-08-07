# Claude Flow Project Management Interface Design Document

## Executive Summary

This document outlines the design for a unified project management interface in Claude Flow that seamlessly integrates with GitHub Projects and Jira APIs. The interface provides a platform-agnostic abstraction layer enabling consistent project management operations across different systems while preserving platform-specific capabilities.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Interface Specifications](#interface-specifications)
4. [GitHub Projects Adapter Implementation Plan](#github-projects-adapter-implementation-plan)
5. [Jira Adapter Implementation Plan](#jira-adapter-implementation-plan)
6. [Error Handling and Edge Cases](#error-handling-and-edge-cases)
7. [Testing Strategy](#testing-strategy)
8. [Migration and Synchronization](#migration-and-synchronization)
9. [Security Considerations](#security-considerations)
10. [Performance Optimization](#performance-optimization)

## Overview

### Goals

- **Unified Interface**: Single API for multiple project management platforms
- **Platform Abstraction**: Hide platform-specific complexity while preserving capabilities
- **Extensibility**: Easy addition of new platforms through adapter pattern
- **Performance**: Optimized for high-throughput operations
- **Reliability**: Robust error handling and recovery mechanisms

### Supported Platforms

| Platform | Version | API Type | Authentication |
|----------|---------|----------|----------------|
| GitHub Projects | v2 | GraphQL | PAT, OAuth, GitHub Apps |
| Jira | Cloud/Server | REST v3 | OAuth 2.0, API Token, Basic Auth |

### Key Features

- ✅ Full CRUD operations for projects, issues, and boards
- ✅ Custom fields and metadata management
- ✅ Workflow and status management
- ✅ Search and filtering capabilities
- ✅ Bulk operations support
- ✅ Real-time webhooks and events
- ✅ Cross-platform data migration
- ✅ Plugin architecture for extensions

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Flow Application                  │
├─────────────────────────────────────────────────────────────┤
│                  Unified Project Manager API                 │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐ │
│ │   Auth    │ │  Events  │ │  Cache   │ │    Plugin     │ │
│ │  Manager  │ │  Manager │ │  Manager │ │   Manager     │ │
│ └───────────┘ └──────────┘ └──────────┘ └───────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                      Adapter Layer                           │
│ ┌──────────────────┐ ┌──────────────────┐ ┌─────────────┐ │
│ │  GitHub Adapter  │ │  Jira Adapter    │ │  [Future]   │ │
│ └──────────────────┘ └──────────────────┘ └─────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌──────────────────┐                  │
│ │  GitHub API v4   │ │  Jira REST v3    │                  │
│ └──────────────────┘ └──────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### Component Descriptions

#### 1. Unified Project Manager
- Central orchestration layer
- Platform-agnostic API surface
- Request routing and response aggregation
- Cross-platform operations coordination

#### 2. Authentication Manager
- Multi-platform credential management
- Token refresh and rotation
- Secure storage with encryption
- Authentication flow orchestration

#### 3. Event Manager
- Webhook registration and management
- Event normalization across platforms
- Event routing and filtering
- Retry and dead-letter queue handling

#### 4. Cache Manager
- Multi-tier caching (memory, Redis, disk)
- Intelligent cache invalidation
- Platform-specific TTL strategies
- Query result caching

#### 5. Plugin Manager
- Dynamic plugin loading
- Sandboxed execution environment
- Plugin lifecycle management
- Inter-plugin communication

#### 6. Platform Adapters
- Platform-specific API integration
- Data transformation and mapping
- Error handling and retry logic
- Rate limiting and throttling

## Interface Specifications

### Core Interfaces

```typescript
// Project Management Interfaces
interface IUnifiedProjectManager {
  // Project Operations
  createProject(data: CreateProjectData): Promise<UnifiedProject>;
  getProject(id: string, platform?: string): Promise<UnifiedProject>;
  updateProject(id: string, updates: Partial<UnifiedProject>): Promise<UnifiedProject>;
  deleteProject(id: string): Promise<void>;
  listProjects(options?: ListOptions): Promise<PaginatedResult<UnifiedProject>>;
  
  // Issue Operations
  createIssue(data: CreateIssueData): Promise<UnifiedIssue>;
  getIssue(id: string, platform?: string): Promise<UnifiedIssue>;
  updateIssue(id: string, updates: Partial<UnifiedIssue>): Promise<UnifiedIssue>;
  deleteIssue(id: string): Promise<void>;
  searchIssues(query: string, options?: SearchOptions): Promise<PaginatedResult<UnifiedIssue>>;
  
  // Board Operations
  createBoard(data: CreateBoardData): Promise<UnifiedBoard>;
  getBoard(id: string): Promise<UnifiedBoard>;
  updateBoard(id: string, updates: Partial<UnifiedBoard>): Promise<UnifiedBoard>;
  deleteBoard(id: string): Promise<void>;
  moveItem(itemId: string, targetColumn: string): Promise<void>;
  
  // Workflow Operations
  getWorkflow(projectId: string): Promise<UnifiedWorkflow>;
  updateWorkflow(projectId: string, workflow: UnifiedWorkflow): Promise<UnifiedWorkflow>;
  transitionIssue(issueId: string, targetStatus: string): Promise<UnifiedIssue>;
  
  // Field Operations
  createField(projectId: string, field: CreateFieldData): Promise<UnifiedField>;
  updateField(projectId: string, fieldId: string, updates: Partial<UnifiedField>): Promise<UnifiedField>;
  deleteField(projectId: string, fieldId: string): Promise<void>;
  setFieldValue(issueId: string, fieldId: string, value: any): Promise<void>;
  
  // Bulk Operations
  bulkCreateIssues(issues: CreateIssueData[]): Promise<UnifiedIssue[]>;
  bulkUpdateIssues(updates: BulkUpdateData[]): Promise<UnifiedIssue[]>;
  bulkDeleteIssues(issueIds: string[]): Promise<void>;
  
  // Cross-Platform Operations
  searchAcrossPlatforms(query: string): Promise<CrossPlatformResults>;
  migrateProject(sourceId: string, targetPlatform: string): Promise<MigrationResult>;
  syncProjects(projectIds: string[]): Promise<SyncResult>;
}

// Data Models
interface UnifiedProject {
  id: string;
  platform: 'github' | 'jira' | string;
  name: string;
  description?: string;
  visibility: 'public' | 'private' | 'internal';
  owner: UnifiedUser;
  created: Date;
  updated: Date;
  status: 'active' | 'closed' | 'archived';
  url: string;
  members: UnifiedUser[];
  settings: ProjectSettings;
  metadata: PlatformMetadata;
}

interface UnifiedIssue {
  id: string;
  platform: string;
  projectId: string;
  title: string;
  description?: string;
  status: string;
  priority?: 'highest' | 'high' | 'medium' | 'low' | 'lowest';
  type?: 'bug' | 'feature' | 'task' | 'epic' | 'story';
  assignee?: UnifiedUser;
  reporter: UnifiedUser;
  labels: string[];
  created: Date;
  updated: Date;
  dueDate?: Date;
  estimate?: number;
  timeSpent?: number;
  parent?: string;
  children?: string[];
  attachments: Attachment[];
  comments: Comment[];
  customFields: Record<string, any>;
  url: string;
  metadata: PlatformMetadata;
}

interface UnifiedBoard {
  id: string;
  platform: string;
  projectId: string;
  name: string;
  type: 'kanban' | 'scrum' | 'custom';
  columns: BoardColumn[];
  swimlanes?: Swimlane[];
  filters?: BoardFilter[];
  settings: BoardSettings;
}

interface UnifiedWorkflow {
  id: string;
  name: string;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  triggers?: WorkflowTrigger[];
}

interface UnifiedField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'user' | 'iteration';
  required: boolean;
  options?: FieldOption[];
  validation?: FieldValidation;
  metadata: PlatformMetadata;
}

// Platform Adapter Interface
interface IPlatformAdapter {
  // Metadata
  readonly platform: string;
  readonly version: string;
  readonly capabilities: AdapterCapabilities;
  
  // Authentication
  authenticate(credentials: PlatformCredentials): Promise<void>;
  refreshAuth(): Promise<void>;
  validateAuth(): Promise<boolean>;
  
  // Project Operations
  createProject(data: CreateProjectData): Promise<PlatformProject>;
  getProject(id: string): Promise<PlatformProject>;
  updateProject(id: string, updates: any): Promise<PlatformProject>;
  deleteProject(id: string): Promise<void>;
  listProjects(options?: ListOptions): Promise<PlatformProject[]>;
  
  // Issue Operations
  createIssue(projectId: string, data: CreateIssueData): Promise<PlatformIssue>;
  getIssue(id: string): Promise<PlatformIssue>;
  updateIssue(id: string, updates: any): Promise<PlatformIssue>;
  deleteIssue(id: string): Promise<void>;
  searchIssues(query: string, options?: any): Promise<PlatformIssue[]>;
  
  // Field Operations
  getFields(projectId: string): Promise<PlatformField[]>;
  createField(projectId: string, field: any): Promise<PlatformField>;
  updateField(projectId: string, fieldId: string, updates: any): Promise<PlatformField>;
  deleteField(projectId: string, fieldId: string): Promise<void>;
  
  // Webhook Management
  registerWebhook(config: WebhookConfig): Promise<string>;
  unregisterWebhook(webhookId: string): Promise<void>;
  handleWebhookEvent(event: any): Promise<UnifiedEvent>;
  
  // Transformation
  transformToUnified(data: any, type: EntityType): any;
  transformFromUnified(data: any, type: EntityType): any;
}

// Supporting Types
interface AdapterCapabilities {
  projects: OperationCapabilities;
  issues: OperationCapabilities;
  boards: OperationCapabilities;
  workflows: OperationCapabilities;
  fields: OperationCapabilities;
  webhooks: boolean;
  bulkOperations: boolean;
  search: SearchCapabilities;
}

interface OperationCapabilities {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
  list: boolean;
  customFields?: boolean;
  hierarchy?: boolean;
}

interface SearchCapabilities {
  basic: boolean;
  advanced: boolean;
  crossProject: boolean;
  customQuery?: boolean;
}

interface PlatformCredentials {
  type: 'token' | 'oauth' | 'basic' | 'app';
  [key: string]: any;
}

interface CreateProjectData {
  name: string;
  description?: string;
  visibility?: 'public' | 'private' | 'internal';
  template?: string;
  settings?: Partial<ProjectSettings>;
}

interface CreateIssueData {
  projectId: string;
  title: string;
  description?: string;
  type?: string;
  priority?: string;
  assignee?: string;
  labels?: string[];
  customFields?: Record<string, any>;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor?: string;
}
```

## GitHub Projects Adapter Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)

#### 1.1 GraphQL Client Setup
```typescript
class GitHubGraphQLClient {
  private client: GraphQLClient;
  private rateLimiter: RateLimiter;
  private queryCache: LRUCache<string, any>;
  
  constructor(config: GitHubConfig) {
    this.client = new GraphQLClient('https://api.github.com/graphql', {
      headers: {
        Authorization: `Bearer ${config.token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    
    this.rateLimiter = new RateLimiter({
      maxRequests: 5000,
      windowMs: 60 * 60 * 1000 // 1 hour
    });
    
    this.queryCache = new LRUCache({
      max: 1000,
      ttl: 5 * 60 * 1000 // 5 minutes
    });
  }
  
  async query<T>(query: string, variables?: any): Promise<T> {
    await this.rateLimiter.acquire();
    
    const cacheKey = hash(query + JSON.stringify(variables));
    const cached = this.queryCache.get(cacheKey);
    if (cached) return cached;
    
    try {
      const result = await this.client.request<T>(query, variables);
      this.queryCache.set(cacheKey, result);
      return result;
    } catch (error) {
      throw this.transformError(error);
    }
  }
  
  async mutation<T>(mutation: string, variables: any): Promise<T> {
    await this.rateLimiter.acquire();
    return this.client.request<T>(mutation, variables);
  }
}
```

#### 1.2 Authentication Manager
```typescript
class GitHubAuthManager {
  private token: string;
  private tokenType: 'pat' | 'oauth' | 'app';
  private refreshToken?: string;
  private expiresAt?: Date;
  
  async authenticate(credentials: GitHubCredentials): Promise<void> {
    switch (credentials.type) {
      case 'pat':
        this.token = credentials.token;
        this.tokenType = 'pat';
        break;
        
      case 'oauth':
        const oauthToken = await this.performOAuthFlow(credentials);
        this.token = oauthToken.access_token;
        this.refreshToken = oauthToken.refresh_token;
        this.expiresAt = new Date(Date.now() + oauthToken.expires_in * 1000);
        this.tokenType = 'oauth';
        break;
        
      case 'app':
        const appToken = await this.generateAppToken(credentials);
        this.token = appToken;
        this.tokenType = 'app';
        this.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        break;
    }
    
    await this.validateToken();
  }
  
  async refreshAuth(): Promise<void> {
    if (this.tokenType === 'oauth' && this.refreshToken) {
      const newToken = await this.refreshOAuthToken(this.refreshToken);
      this.token = newToken.access_token;
      this.refreshToken = newToken.refresh_token;
      this.expiresAt = new Date(Date.now() + newToken.expires_in * 1000);
    } else if (this.tokenType === 'app') {
      // Regenerate app token
      await this.authenticate({ type: 'app', /* ... */ });
    }
  }
}
```

### Phase 2: Project Operations (Week 3-4)

#### 2.1 Project Management
```typescript
class GitHubProjectOperations {
  constructor(private client: GitHubGraphQLClient) {}
  
  async createProject(ownerId: string, data: CreateProjectData): Promise<ProjectV2> {
    const mutation = `
      mutation CreateProject($input: CreateProjectV2Input!) {
        createProjectV2(input: $input) {
          projectV2 {
            id
            title
            shortDescription
            public
            closed
            url
            createdAt
            updatedAt
          }
        }
      }
    `;
    
    const variables = {
      input: {
        ownerId,
        title: data.name,
        shortDescription: data.description,
        public: data.visibility === 'public'
      }
    };
    
    const result = await this.client.mutation<any>(mutation, variables);
    return result.createProjectV2.projectV2;
  }
  
  async getProject(projectId: string): Promise<ProjectV2> {
    const query = `
      query GetProject($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            id
            title
            shortDescription
            public
            closed
            url
            owner {
              ... on Organization {
                login
                avatarUrl
              }
              ... on User {
                login
                avatarUrl
              }
            }
            items(first: 100) {
              totalCount
              nodes {
                id
                type
                content {
                  ... on Issue {
                    title
                    number
                  }
                  ... on PullRequest {
                    title
                    number
                  }
                }
              }
            }
            fields(first: 20) {
              nodes {
                ... on ProjectV2Field {
                  id
                  name
                  dataType
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const result = await this.client.query<any>(query, { projectId });
    return result.node;
  }
  
  async updateProject(projectId: string, updates: any): Promise<ProjectV2> {
    const mutation = `
      mutation UpdateProject($input: UpdateProjectV2Input!) {
        updateProjectV2(input: $input) {
          projectV2 {
            id
            title
            shortDescription
            public
            closed
          }
        }
      }
    `;
    
    const variables = {
      input: {
        projectId,
        ...this.mapUpdatesToGitHub(updates)
      }
    };
    
    const result = await this.client.mutation<any>(mutation, variables);
    return result.updateProjectV2.projectV2;
  }
}
```

#### 2.2 Issue Management
```typescript
class GitHubIssueOperations {
  async addIssueToProject(projectId: string, contentId: string): Promise<ProjectV2Item> {
    const mutation = `
      mutation AddIssueToProject($input: AddProjectV2ItemByIdInput!) {
        addProjectV2ItemById(input: $input) {
          item {
            id
            type
            createdAt
            content {
              ... on Issue {
                id
                title
                number
                state
                assignees(first: 10) {
                  nodes {
                    login
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const variables = {
      input: { projectId, contentId }
    };
    
    const result = await this.client.mutation<any>(mutation, variables);
    return result.addProjectV2ItemById.item;
  }
  
  async updateItemField(projectId: string, itemId: string, fieldId: string, value: any): Promise<void> {
    const mutation = `
      mutation UpdateItemField($input: UpdateProjectV2ItemFieldValueInput!) {
        updateProjectV2ItemFieldValue(input: $input) {
          projectV2Item {
            id
          }
        }
      }
    `;
    
    const variables = {
      input: {
        projectId,
        itemId,
        fieldId,
        value: this.transformFieldValue(value)
      }
    };
    
    await this.client.mutation<any>(mutation, variables);
  }
  
  private transformFieldValue(value: any): any {
    // Transform based on field type
    if (typeof value === 'string') {
      return { text: value };
    } else if (typeof value === 'number') {
      return { number: value };
    } else if (value instanceof Date) {
      return { date: value.toISOString().split('T')[0] };
    }
    // Handle other types...
    return value;
  }
}
```

### Phase 3: Advanced Features (Week 5-6)

#### 3.1 Field Management
```typescript
class GitHubFieldOperations {
  async createField(projectId: string, field: CreateFieldData): Promise<ProjectV2Field> {
    const mutation = `
      mutation CreateField($input: CreateProjectV2FieldInput!) {
        createProjectV2Field(input: $input) {
          field {
            ... on ProjectV2Field {
              id
              name
              dataType
            }
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
              }
            }
          }
        }
      }
    `;
    
    const input = {
      projectId,
      name: field.name,
      dataType: this.mapFieldType(field.type)
    };
    
    if (field.type === 'select' && field.options) {
      // Create single select field with options
      input.singleSelectOptions = field.options.map(opt => ({
        name: opt.label,
        color: opt.color || 'GRAY'
      }));
    }
    
    const result = await this.client.mutation<any>(mutation, { input });
    return result.createProjectV2Field.field;
  }
  
  async updateField(projectId: string, fieldId: string, updates: any): Promise<ProjectV2Field> {
    // Implementation for field updates
    // Note: Limited support in GitHub API for field updates
  }
  
  private mapFieldType(type: string): string {
    const typeMap = {
      'text': 'TEXT',
      'number': 'NUMBER',
      'date': 'DATE',
      'select': 'SINGLE_SELECT',
      'iteration': 'ITERATION'
    };
    return typeMap[type] || 'TEXT';
  }
}
```

#### 3.2 Webhook Management
```typescript
class GitHubWebhookManager {
  private webhooks: Map<string, WebhookConfig> = new Map();
  
  async registerWebhook(config: WebhookConfig): Promise<string> {
    const response = await fetch(`https://api.github.com/orgs/${config.orgName}/hooks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['projects_v2', 'projects_v2_item'],
        config: {
          url: config.callbackUrl,
          content_type: 'json',
          secret: config.secret
        }
      })
    });
    
    const webhook = await response.json();
    this.webhooks.set(webhook.id, config);
    return webhook.id;
  }
  
  async handleWebhookEvent(headers: any, body: any): Promise<UnifiedEvent> {
    // Verify webhook signature
    const signature = headers['x-hub-signature-256'];
    if (!this.verifySignature(signature, body)) {
      throw new Error('Invalid webhook signature');
    }
    
    const event = headers['x-github-event'];
    const action = body.action;
    
    return this.transformWebhookEvent(event, action, body);
  }
  
  private verifySignature(signature: string, body: any): boolean {
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(JSON.stringify(body));
    const expectedSignature = `sha256=${hmac.digest('hex')}`;
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}
```

### Phase 4: Data Transformation (Week 7-8)

#### 4.1 Unified Transformation
```typescript
class GitHubDataTransformer {
  transformProjectToUnified(project: ProjectV2): UnifiedProject {
    return {
      id: project.id,
      platform: 'github',
      name: project.title,
      description: project.shortDescription,
      visibility: project.public ? 'public' : 'private',
      owner: this.transformOwner(project.owner),
      created: new Date(project.createdAt),
      updated: new Date(project.updatedAt),
      status: project.closed ? 'closed' : 'active',
      url: project.url,
      members: [], // Would require additional query
      settings: {
        automationEnabled: true,
        templateId: null
      },
      metadata: {
        platform: 'github',
        nodeId: project.id,
        number: project.number,
        hasRepository: !!project.repository
      }
    };
  }
  
  transformIssueToUnified(item: ProjectV2Item): UnifiedIssue {
    const issue = item.content;
    return {
      id: item.id,
      platform: 'github',
      projectId: item.project.id,
      title: issue.title,
      description: issue.body,
      status: this.mapStatus(item.fieldValues),
      priority: this.mapPriority(item.fieldValues),
      type: this.mapIssueType(issue.labels),
      assignee: issue.assignees?.nodes[0] ? {
        id: issue.assignees.nodes[0].id,
        username: issue.assignees.nodes[0].login,
        email: issue.assignees.nodes[0].email,
        name: issue.assignees.nodes[0].name
      } : undefined,
      reporter: {
        id: issue.author.id,
        username: issue.author.login,
        email: issue.author.email,
        name: issue.author.name
      },
      labels: issue.labels.nodes.map(l => l.name),
      created: new Date(issue.createdAt),
      updated: new Date(issue.updatedAt),
      dueDate: this.extractDueDate(item.fieldValues),
      estimate: this.extractEstimate(item.fieldValues),
      timeSpent: null, // Not supported by GitHub
      parent: null, // Limited hierarchy support
      children: [],
      attachments: [],
      comments: issue.comments.nodes.map(this.transformComment),
      customFields: this.extractCustomFields(item.fieldValues),
      url: issue.url,
      metadata: {
        platform: 'github',
        nodeId: item.id,
        contentNodeId: issue.id,
        number: issue.number,
        state: issue.state
      }
    };
  }
  
  private mapStatus(fieldValues: any): string {
    const statusField = fieldValues.nodes.find(f => 
      f.field.name.toLowerCase() === 'status'
    );
    return statusField?.value?.name || 'Todo';
  }
  
  private mapPriority(fieldValues: any): string {
    const priorityField = fieldValues.nodes.find(f => 
      f.field.name.toLowerCase() === 'priority'
    );
    const priorityMap = {
      'Critical': 'highest',
      'High': 'high',
      'Medium': 'medium',
      'Low': 'low',
      'Minor': 'lowest'
    };
    return priorityMap[priorityField?.value?.name] || 'medium';
  }
}
```

## Jira Adapter Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)

#### 1.1 REST Client Setup
```typescript
class JiraRESTClient {
  private baseUrl: string;
  private auth: JiraAuth;
  private rateLimiter: RateLimiter;
  private connectionPool: AxiosInstance;
  
  constructor(config: JiraConfig) {
    this.baseUrl = config.baseUrl;
    this.auth = config.auth;
    
    this.connectionPool = axios.create({
      baseURL: `${this.baseUrl}/rest/api/3`,
      timeout: 30000,
      maxRedirects: 5,
      httpAgent: new Agent({ keepAlive: true, maxSockets: 10 }),
      httpsAgent: new Agent({ keepAlive: true, maxSockets: 10 })
    });
    
    this.rateLimiter = new RateLimiter({
      maxRequests: config.rateLimit || 50,
      windowMs: 1000
    });
    
    this.setupInterceptors();
  }
  
  private setupInterceptors(): void {
    // Request interceptor for authentication
    this.connectionPool.interceptors.request.use(async (config) => {
      await this.rateLimiter.acquire();
      
      if (this.auth.type === 'oauth2') {
        config.headers.Authorization = `Bearer ${this.auth.accessToken}`;
      } else if (this.auth.type === 'basic') {
        const encoded = Buffer.from(`${this.auth.email}:${this.auth.apiToken}`).toString('base64');
        config.headers.Authorization = `Basic ${encoded}`;
      }
      
      return config;
    });
    
    // Response interceptor for error handling
    this.connectionPool.interceptors.response.use(
      response => response,
      async error => {
        if (error.response?.status === 429) {
          // Handle rate limiting
          const retryAfter = error.response.headers['retry-after'] || 60;
          await sleep(retryAfter * 1000);
          return this.connectionPool.request(error.config);
        }
        
        if (error.response?.status === 401 && this.auth.type === 'oauth2') {
          // Refresh token
          await this.refreshOAuthToken();
          return this.connectionPool.request(error.config);
        }
        
        throw this.transformError(error);
      }
    );
  }
  
  async get<T>(path: string, params?: any): Promise<T> {
    const response = await this.connectionPool.get<T>(path, { params });
    return response.data;
  }
  
  async post<T>(path: string, data: any): Promise<T> {
    const response = await this.connectionPool.post<T>(path, data);
    return response.data;
  }
  
  async put<T>(path: string, data: any): Promise<T> {
    const response = await this.connectionPool.put<T>(path, data);
    return response.data;
  }
  
  async delete(path: string): Promise<void> {
    await this.connectionPool.delete(path);
  }
}
```

#### 1.2 Authentication Manager
```typescript
class JiraAuthManager {
  private tokenStore: SecureTokenStore;
  
  async authenticate(credentials: JiraCredentials): Promise<void> {
    switch (credentials.type) {
      case 'oauth2':
        await this.performOAuth2Flow(credentials);
        break;
        
      case 'basic':
        // Validate API token
        await this.validateBasicAuth(credentials);
        this.tokenStore.set('auth', {
          type: 'basic',
          email: credentials.email,
          apiToken: credentials.apiToken
        });
        break;
        
      case 'pat':
        // Personal Access Token (Jira Data Center)
        await this.validatePAT(credentials);
        this.tokenStore.set('auth', {
          type: 'pat',
          token: credentials.token
        });
        break;
    }
  }
  
  private async performOAuth2Flow(credentials: OAuth2Credentials): Promise<void> {
    const tokenUrl = `${credentials.authUrl}/oauth/token`;
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: credentials.code,
        redirect_uri: credentials.redirectUri,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret
      })
    });
    
    const tokens = await response.json();
    
    this.tokenStore.set('auth', {
      type: 'oauth2',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000
    });
  }
  
  async refreshOAuthToken(): Promise<void> {
    const auth = this.tokenStore.get('auth');
    
    if (auth.type !== 'oauth2' || !auth.refreshToken) {
      throw new Error('Cannot refresh non-OAuth2 token');
    }
    
    const response = await fetch(`${this.authUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: auth.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret
      })
    });
    
    const tokens = await response.json();
    
    this.tokenStore.set('auth', {
      ...auth,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || auth.refreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000
    });
  }
}
```

### Phase 2: Project Operations (Week 3-4)

#### 2.1 Project Management
```typescript
class JiraProjectOperations {
  constructor(private client: JiraRESTClient) {}
  
  async createProject(data: CreateProjectData): Promise<JiraProject> {
    const projectData = {
      key: this.generateProjectKey(data.name),
      name: data.name,
      description: data.description,
      projectTypeKey: data.type || 'software',
      projectTemplateKey: data.template || 'com.atlassian.jira-core-project-templates:jira-core-simplified-project-management',
      leadAccountId: data.leadId,
      assigneeType: 'PROJECT_LEAD'
    };
    
    return await this.client.post<JiraProject>('/project', projectData);
  }
  
  async getProject(projectIdOrKey: string): Promise<JiraProject> {
    const params = {
      expand: 'description,lead,issueTypes,url,projectKeys,permissions'
    };
    
    return await this.client.get<JiraProject>(`/project/${projectIdOrKey}`, params);
  }
  
  async updateProject(projectIdOrKey: string, updates: any): Promise<JiraProject> {
    const updateData = this.mapUpdatesToJira(updates);
    return await this.client.put<JiraProject>(`/project/${projectIdOrKey}`, updateData);
  }
  
  async deleteProject(projectIdOrKey: string): Promise<void> {
    await this.client.delete(`/project/${projectIdOrKey}`);
  }
  
  async listProjects(options?: ListOptions): Promise<JiraProject[]> {
    const params = {
      startAt: options?.offset || 0,
      maxResults: options?.limit || 50,
      orderBy: options?.orderBy || 'name',
      expand: 'description,lead,url'
    };
    
    const response = await this.client.get<{
      values: JiraProject[];
      startAt: number;
      maxResults: number;
      total: number;
    }>('/project/search', params);
    
    return response.values;
  }
  
  private generateProjectKey(name: string): string {
    // Generate a unique project key from name
    const words = name.split(' ');
    const key = words
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 10);
    
    return key || 'PROJ';
  }
}
```

#### 2.2 Issue Management
```typescript
class JiraIssueOperations {
  constructor(private client: JiraRESTClient) {}
  
  async createIssue(data: CreateIssueData): Promise<JiraIssue> {
    const issueData = {
      fields: {
        project: { key: data.projectKey },
        summary: data.title,
        description: this.convertToADF(data.description),
        issuetype: { name: data.type || 'Task' },
        priority: { name: data.priority || 'Medium' },
        assignee: data.assignee ? { accountId: data.assignee } : null,
        labels: data.labels || [],
        ...this.mapCustomFields(data.customFields)
      }
    };
    
    return await this.client.post<JiraIssue>('/issue', issueData);
  }
  
  async getIssue(issueIdOrKey: string): Promise<JiraIssue> {
    const params = {
      expand: 'renderedFields,names,schema,transitions,operations,editmeta,changelog'
    };
    
    return await this.client.get<JiraIssue>(`/issue/${issueIdOrKey}`, params);
  }
  
  async updateIssue(issueIdOrKey: string, updates: any): Promise<JiraIssue> {
    const updateData = {
      fields: this.mapFieldUpdates(updates)
    };
    
    await this.client.put(`/issue/${issueIdOrKey}`, updateData);
    return this.getIssue(issueIdOrKey);
  }
  
  async searchIssues(jql: string, options?: SearchOptions): Promise<JiraSearchResult> {
    const searchData = {
      jql,
      startAt: options?.offset || 0,
      maxResults: options?.limit || 50,
      fields: options?.fields || ['*all'],
      expand: options?.expand || ['names', 'schema', 'transitions']
    };
    
    return await this.client.post<JiraSearchResult>('/search', searchData);
  }
  
  async transitionIssue(issueIdOrKey: string, transitionId: string): Promise<void> {
    const transitionData = {
      transition: { id: transitionId }
    };
    
    await this.client.post(`/issue/${issueIdOrKey}/transitions`, transitionData);
  }
  
  private convertToADF(markdown?: string): any {
    if (!markdown) return null;
    
    // Convert markdown to Atlassian Document Format
    return {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: markdown
            }
          ]
        }
      ]
    };
  }
  
  private mapCustomFields(customFields?: Record<string, any>): Record<string, any> {
    if (!customFields) return {};
    
    const mapped: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(customFields)) {
      // Map to Jira custom field format (customfield_XXXXX)
      const fieldId = this.getCustomFieldId(key);
      if (fieldId) {
        mapped[fieldId] = this.transformCustomFieldValue(fieldId, value);
      }
    }
    
    return mapped;
  }
}
```

### Phase 3: Advanced Features (Week 5-6)

#### 3.1 Board Management
```typescript
class JiraBoardOperations {
  constructor(private client: JiraRESTClient) {}
  
  async createBoard(data: CreateBoardData): Promise<JiraBoard> {
    const boardData = {
      name: data.name,
      type: data.type || 'scrum',
      filterId: data.filterId,
      location: {
        type: 'project',
        projectKeyOrId: data.projectKey
      }
    };
    
    // Use Agile API endpoint
    return await this.client.post<JiraBoard>('/rest/agile/1.0/board', boardData);
  }
  
  async getBoard(boardId: number): Promise<JiraBoard> {
    return await this.client.get<JiraBoard>(`/rest/agile/1.0/board/${boardId}`);
  }
  
  async getBoardConfiguration(boardId: number): Promise<JiraBoardConfig> {
    return await this.client.get<JiraBoardConfig>(
      `/rest/agile/1.0/board/${boardId}/configuration`
    );
  }
  
  async moveIssueInBoard(issueId: string, columnId: string): Promise<void> {
    // Get transitions available for the issue
    const transitions = await this.getIssueTransitions(issueId);
    
    // Find transition that moves to target column status
    const targetTransition = transitions.find(t => 
      t.to.id === this.getStatusForColumn(columnId)
    );
    
    if (targetTransition) {
      await this.transitionIssue(issueId, targetTransition.id);
    }
  }
  
  async getSprints(boardId: number): Promise<JiraSprint[]> {
    const response = await this.client.get<{
      values: JiraSprint[];
    }>(`/rest/agile/1.0/board/${boardId}/sprint`);
    
    return response.values;
  }
  
  async createSprint(data: CreateSprintData): Promise<JiraSprint> {
    const sprintData = {
      name: data.name,
      startDate: data.startDate.toISOString(),
      endDate: data.endDate.toISOString(),
      originBoardId: data.boardId,
      goal: data.goal
    };
    
    return await this.client.post<JiraSprint>('/rest/agile/1.0/sprint', sprintData);
  }
}
```

#### 3.2 Field Management
```typescript
class JiraFieldOperations {
  private fieldCache: Map<string, JiraField> = new Map();
  
  constructor(private client: JiraRESTClient) {}
  
  async getFields(): Promise<JiraField[]> {
    const fields = await this.client.get<JiraField[]>('/field');
    
    // Cache fields for quick lookup
    fields.forEach(field => {
      this.fieldCache.set(field.id, field);
      this.fieldCache.set(field.name, field);
    });
    
    return fields;
  }
  
  async createCustomField(data: CreateFieldData): Promise<JiraField> {
    const fieldData = {
      name: data.name,
      description: data.description,
      type: this.mapFieldTypeToJira(data.type),
      searcherKey: this.getSearcherForType(data.type)
    };
    
    // Note: Creating custom fields requires Jira admin permissions
    // and uses a different API endpoint
    return await this.client.post<JiraField>('/rest/api/3/field', fieldData);
  }
  
  async getFieldOptions(fieldId: string): Promise<JiraFieldOption[]> {
    const field = await this.getField(fieldId);
    
    if (field.schema?.custom && field.schema.customId) {
      const options = await this.client.get<JiraFieldOption[]>(
        `/rest/api/3/customField/${field.schema.customId}/option`
      );
      return options;
    }
    
    return [];
  }
  
  async createFieldOption(fieldId: string, option: FieldOption): Promise<JiraFieldOption> {
    const field = await this.getField(fieldId);
    
    if (!field.schema?.customId) {
      throw new Error('Cannot add options to non-custom field');
    }
    
    const optionData = {
      value: option.label,
      disabled: false
    };
    
    return await this.client.post<JiraFieldOption>(
      `/rest/api/3/customField/${field.schema.customId}/option`,
      optionData
    );
  }
  
  private mapFieldTypeToJira(type: string): string {
    const typeMap = {
      'text': 'com.atlassian.jira.plugin.system.customfieldtypes:textfield',
      'textarea': 'com.atlassian.jira.plugin.system.customfieldtypes:textarea',
      'number': 'com.atlassian.jira.plugin.system.customfieldtypes:float',
      'date': 'com.atlassian.jira.plugin.system.customfieldtypes:datepicker',
      'datetime': 'com.atlassian.jira.plugin.system.customfieldtypes:datetime',
      'select': 'com.atlassian.jira.plugin.system.customfieldtypes:select',
      'multiselect': 'com.atlassian.jira.plugin.system.customfieldtypes:multiselect',
      'user': 'com.atlassian.jira.plugin.system.customfieldtypes:userpicker',
      'checkbox': 'com.atlassian.jira.plugin.system.customfieldtypes:multicheckboxes'
    };
    
    return typeMap[type] || typeMap['text'];
  }
}
```

### Phase 4: Data Transformation (Week 7-8)

#### 4.1 Unified Transformation
```typescript
class JiraDataTransformer {
  transformProjectToUnified(project: JiraProject): UnifiedProject {
    return {
      id: project.id,
      platform: 'jira',
      name: project.name,
      description: project.description,
      visibility: project.projectTypeKey === 'business' ? 'internal' : 'private',
      owner: {
        id: project.lead.accountId,
        username: project.lead.displayName,
        email: project.lead.emailAddress,
        name: project.lead.displayName
      },
      created: new Date(project.created || Date.now()),
      updated: new Date(project.updated || Date.now()),
      status: project.archived ? 'archived' : 'active',
      url: project.self,
      members: [], // Would require additional API call
      settings: {
        automationEnabled: true,
        templateId: project.projectTemplateKey,
        issueTypes: project.issueTypes?.map(t => t.name)
      },
      metadata: {
        platform: 'jira',
        key: project.key,
        projectTypeKey: project.projectTypeKey,
        style: project.style
      }
    };
  }
  
  transformIssueToUnified(issue: JiraIssue): UnifiedIssue {
    return {
      id: issue.id,
      platform: 'jira',
      projectId: issue.fields.project.id,
      title: issue.fields.summary,
      description: this.convertFromADF(issue.fields.description),
      status: issue.fields.status.name,
      priority: this.mapPriority(issue.fields.priority),
      type: issue.fields.issuetype.name.toLowerCase(),
      assignee: issue.fields.assignee ? {
        id: issue.fields.assignee.accountId,
        username: issue.fields.assignee.displayName,
        email: issue.fields.assignee.emailAddress,
        name: issue.fields.assignee.displayName
      } : undefined,
      reporter: {
        id: issue.fields.reporter.accountId,
        username: issue.fields.reporter.displayName,
        email: issue.fields.reporter.emailAddress,
        name: issue.fields.reporter.displayName
      },
      labels: issue.fields.labels || [],
      created: new Date(issue.fields.created),
      updated: new Date(issue.fields.updated),
      dueDate: issue.fields.duedate ? new Date(issue.fields.duedate) : undefined,
      estimate: issue.fields.timetracking?.originalEstimateSeconds 
        ? issue.fields.timetracking.originalEstimateSeconds / 3600 
        : undefined,
      timeSpent: issue.fields.timetracking?.timeSpentSeconds
        ? issue.fields.timetracking.timeSpentSeconds / 3600
        : undefined,
      parent: issue.fields.parent?.id,
      children: issue.fields.subtasks?.map(s => s.id) || [],
      attachments: issue.fields.attachment?.map(this.transformAttachment) || [],
      comments: [], // Would require additional API call
      customFields: this.extractCustomFields(issue.fields),
      url: issue.self,
      metadata: {
        platform: 'jira',
        key: issue.key,
        issueType: issue.fields.issuetype.id,
        resolution: issue.fields.resolution?.name
      }
    };
  }
  
  private convertFromADF(adf: any): string {
    if (!adf) return '';
    
    // Simple ADF to markdown conversion
    // In production, use a proper ADF parser
    if (adf.content) {
      return adf.content
        .map((node: any) => {
          if (node.type === 'paragraph') {
            return node.content?.map((c: any) => c.text).join('') || '';
          }
          return '';
        })
        .join('\n');
    }
    
    return typeof adf === 'string' ? adf : '';
  }
  
  private mapPriority(priority?: JiraPriority): string {
    if (!priority) return 'medium';
    
    const priorityMap = {
      'Highest': 'highest',
      'High': 'high',
      'Medium': 'medium',
      'Low': 'low',
      'Lowest': 'lowest'
    };
    
    return priorityMap[priority.name] || 'medium';
  }
  
  private extractCustomFields(fields: any): Record<string, any> {
    const customFields: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(fields)) {
      if (key.startsWith('customfield_')) {
        // Extract meaningful name from field metadata if available
        const fieldName = this.getFieldName(key) || key;
        customFields[fieldName] = this.transformCustomFieldValue(value);
      }
    }
    
    return customFields;
  }
}
```

## Error Handling and Edge Cases

### Error Classification

```typescript
enum ErrorType {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  RATE_LIMIT = 'RATE_LIMIT',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  PLATFORM = 'PLATFORM',
  TRANSFORMATION = 'TRANSFORMATION',
  UNSUPPORTED = 'UNSUPPORTED'
}

class UnifiedError extends Error {
  constructor(
    public type: ErrorType,
    public message: string,
    public platform?: string,
    public originalError?: any,
    public retryable: boolean = false,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'UnifiedError';
  }
}
```

### Error Handling Strategy

```typescript
class ErrorHandler {
  private retryStrategies: Map<ErrorType, RetryStrategy> = new Map([
    [ErrorType.RATE_LIMIT, new ExponentialBackoffStrategy(60000)],
    [ErrorType.NETWORK, new LinearBackoffStrategy(5000, 3)],
    [ErrorType.AUTHENTICATION, new RefreshAuthStrategy()]
  ]);
  
  async handleError(error: any, context: ErrorContext): Promise<any> {
    const unifiedError = this.classifyError(error, context.platform);
    
    // Log error for monitoring
    await this.logError(unifiedError, context);
    
    // Check if error is retryable
    if (unifiedError.retryable) {
      const strategy = this.retryStrategies.get(unifiedError.type);
      if (strategy) {
        return await strategy.retry(context.operation, context.params);
      }
    }
    
    // Transform error for client
    throw this.transformErrorForClient(unifiedError);
  }
  
  private classifyError(error: any, platform: string): UnifiedError {
    if (platform === 'github') {
      return this.classifyGitHubError(error);
    } else if (platform === 'jira') {
      return this.classifyJiraError(error);
    }
    
    return new UnifiedError(
      ErrorType.PLATFORM,
      'Unknown platform error',
      platform,
      error
    );
  }
  
  private classifyGitHubError(error: any): UnifiedError {
    if (error.response?.errors) {
      const firstError = error.response.errors[0];
      
      if (firstError.type === 'RATE_LIMITED') {
        return new UnifiedError(
          ErrorType.RATE_LIMIT,
          'GitHub API rate limit exceeded',
          'github',
          error,
          true,
          60000
        );
      }
      
      if (firstError.type === 'FORBIDDEN') {
        return new UnifiedError(
          ErrorType.AUTHORIZATION,
          'Insufficient permissions for GitHub operation',
          'github',
          error
        );
      }
    }
    
    if (error.status === 401) {
      return new UnifiedError(
        ErrorType.AUTHENTICATION,
        'GitHub authentication failed',
        'github',
        error,
        true
      );
    }
    
    return new UnifiedError(
      ErrorType.PLATFORM,
      error.message || 'GitHub API error',
      'github',
      error
    );
  }
  
  private classifyJiraError(error: any): UnifiedError {
    if (error.response?.status === 429) {
      return new UnifiedError(
        ErrorType.RATE_LIMIT,
        'Jira API rate limit exceeded',
        'jira',
        error,
        true,
        error.response.headers['retry-after'] * 1000
      );
    }
    
    if (error.response?.status === 401) {
      return new UnifiedError(
        ErrorType.AUTHENTICATION,
        'Jira authentication failed',
        'jira',
        error,
        true
      );
    }
    
    if (error.response?.status === 403) {
      return new UnifiedError(
        ErrorType.AUTHORIZATION,
        'Insufficient permissions for Jira operation',
        'jira',
        error
      );
    }
    
    if (error.response?.status === 404) {
      return new UnifiedError(
        ErrorType.NOT_FOUND,
        'Jira resource not found',
        'jira',
        error
      );
    }
    
    return new UnifiedError(
      ErrorType.PLATFORM,
      error.message || 'Jira API error',
      'jira',
      error
    );
  }
}
```

### Edge Case Handling

```typescript
class EdgeCaseHandler {
  // Handle platform-specific limitations
  async handleUnsupportedOperation(
    operation: string,
    platform: string,
    fallback?: () => Promise<any>
  ): Promise<any> {
    const unsupportedOps = {
      github: ['timeTracking', 'customWorkflows', 'issueHierarchy'],
      jira: ['repositoryIntegration', 'githubActions']
    };
    
    if (unsupportedOps[platform]?.includes(operation)) {
      if (fallback) {
        return await fallback();
      }
      
      throw new UnifiedError(
        ErrorType.UNSUPPORTED,
        `Operation '${operation}' is not supported on ${platform}`,
        platform
      );
    }
  }
  
  // Handle data inconsistencies
  sanitizeData(data: any, platform: string): any {
    if (platform === 'github') {
      // GitHub specific sanitization
      if (data.description && data.description.length > 1024) {
        data.description = data.description.substring(0, 1021) + '...';
      }
    } else if (platform === 'jira') {
      // Jira specific sanitization
      if (data.summary && data.summary.length > 255) {
        data.summary = data.summary.substring(0, 252) + '...';
      }
    }
    
    return data;
  }
  
  // Handle missing required fields
  async enrichData(data: any, platform: string): Promise<any> {
    const enriched = { ...data };
    
    if (platform === 'jira' && !enriched.issueType) {
      // Default to Task if no issue type specified
      enriched.issueType = 'Task';
    }
    
    if (platform === 'github' && !enriched.visibility) {
      // Default to private for GitHub projects
      enriched.visibility = 'private';
    }
    
    return enriched;
  }
}
```

## Testing Strategy

### Test Architecture

```typescript
// Test framework setup
interface TestSuite {
  name: string;
  platform: 'github' | 'jira' | 'unified';
  tests: TestCase[];
}

interface TestCase {
  name: string;
  type: 'unit' | 'integration' | 'e2e';
  setup?: () => Promise<void>;
  execute: () => Promise<void>;
  verify: () => Promise<void>;
  cleanup?: () => Promise<void>;
}
```

### Unit Tests

```typescript
describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;
  let mockClient: jest.Mocked<GitHubGraphQLClient>;
  
  beforeEach(() => {
    mockClient = createMockGraphQLClient();
    adapter = new GitHubAdapter(mockClient);
  });
  
  describe('createProject', () => {
    it('should create a project with required fields', async () => {
      const projectData = {
        name: 'Test Project',
        description: 'Test Description',
        visibility: 'public' as const
      };
      
      mockClient.mutation.mockResolvedValue({
        createProjectV2: {
          projectV2: {
            id: 'PVT_123',
            title: 'Test Project',
            shortDescription: 'Test Description',
            public: true
          }
        }
      });
      
      const result = await adapter.createProject(projectData);
      
      expect(result.name).toBe('Test Project');
      expect(result.visibility).toBe('public');
      expect(mockClient.mutation).toHaveBeenCalledWith(
        expect.stringContaining('createProjectV2'),
        expect.objectContaining({
          input: expect.objectContaining({
            title: 'Test Project'
          })
        })
      );
    });
    
    it('should handle GraphQL errors', async () => {
      mockClient.mutation.mockRejectedValue({
        response: {
          errors: [{
            type: 'FORBIDDEN',
            message: 'Insufficient permissions'
          }]
        }
      });
      
      await expect(adapter.createProject({
        name: 'Test'
      })).rejects.toThrow(UnifiedError);
    });
  });
});
```

### Integration Tests

```typescript
describe('Cross-Platform Integration', () => {
  let manager: UnifiedProjectManager;
  let githubAdapter: GitHubAdapter;
  let jiraAdapter: JiraAdapter;
  
  beforeAll(async () => {
    // Setup with real API connections (test environment)
    githubAdapter = new GitHubAdapter({
      token: process.env.GITHUB_TEST_TOKEN
    });
    
    jiraAdapter = new JiraAdapter({
      baseUrl: process.env.JIRA_TEST_URL,
      email: process.env.JIRA_TEST_EMAIL,
      apiToken: process.env.JIRA_TEST_TOKEN
    });
    
    manager = new UnifiedProjectManager();
    manager.registerAdapter('github', githubAdapter);
    manager.registerAdapter('jira', jiraAdapter);
  });
  
  describe('Project Synchronization', () => {
    it('should sync project between GitHub and Jira', async () => {
      // Create project in GitHub
      const githubProject = await manager.createProject({
        platform: 'github',
        name: 'Integration Test Project',
        description: 'Testing cross-platform sync'
      });
      
      // Migrate to Jira
      const migration = await manager.migrateProject(
        githubProject.id,
        'jira'
      );
      
      expect(migration.status).toBe('success');
      expect(migration.itemsMigrated).toBeGreaterThan(0);
      
      // Verify project exists in Jira
      const jiraProject = await manager.getProject(
        migration.targetProjectId,
        'jira'
      );
      
      expect(jiraProject.name).toBe('Integration Test Project');
    });
  });
});
```

### End-to-End Tests

```typescript
describe('E2E: Complete Workflow', () => {
  let manager: UnifiedProjectManager;
  
  beforeAll(async () => {
    manager = await createUnifiedProjectManager({
      github: {
        token: process.env.GITHUB_TOKEN
      },
      jira: {
        baseUrl: process.env.JIRA_URL,
        email: process.env.JIRA_EMAIL,
        apiToken: process.env.JIRA_TOKEN
      }
    });
  });
  
  test('Complete project lifecycle', async () => {
    // 1. Create project
    const project = await manager.createProject({
      name: 'E2E Test Project',
      description: 'End-to-end test project',
      platform: 'github'
    });
    
    // 2. Add custom fields
    const priorityField = await manager.createField(project.id, {
      name: 'Priority',
      type: 'select',
      options: [
        { label: 'High', value: 'high' },
        { label: 'Medium', value: 'medium' },
        { label: 'Low', value: 'low' }
      ]
    });
    
    // 3. Create issues
    const issues = await manager.bulkCreateIssues([
      {
        projectId: project.id,
        title: 'Setup CI/CD',
        type: 'task',
        priority: 'high'
      },
      {
        projectId: project.id,
        title: 'Write documentation',
        type: 'task',
        priority: 'medium'
      }
    ]);
    
    // 4. Create board
    const board = await manager.createBoard({
      projectId: project.id,
      name: 'Sprint Board',
      type: 'kanban'
    });
    
    // 5. Move issue through workflow
    await manager.transitionIssue(
      issues[0].id,
      'In Progress'
    );
    
    // 6. Search across platforms
    const searchResults = await manager.searchAcrossPlatforms(
      'CI/CD'
    );
    
    expect(searchResults.total).toBeGreaterThan(0);
    
    // 7. Cleanup
    await manager.deleteProject(project.id);
  });
});
```

### Performance Tests

```typescript
describe('Performance Benchmarks', () => {
  let manager: UnifiedProjectManager;
  
  test('Bulk operations performance', async () => {
    const startTime = Date.now();
    
    // Create 100 issues
    const issues = Array.from({ length: 100 }, (_, i) => ({
      projectId: 'test-project',
      title: `Performance Test Issue ${i}`,
      description: 'Performance testing'
    }));
    
    await manager.bulkCreateIssues(issues);
    
    const duration = Date.now() - startTime;
    
    // Should complete within 30 seconds
    expect(duration).toBeLessThan(30000);
    
    // Calculate throughput
    const throughput = issues.length / (duration / 1000);
    console.log(`Throughput: ${throughput.toFixed(2)} issues/second`);
  });
  
  test('Concurrent operations', async () => {
    const operations = [
      manager.listProjects({ limit: 50 }),
      manager.searchIssues('bug'),
      manager.getProject('project-1'),
      manager.getProject('project-2'),
      manager.getProject('project-3')
    ];
    
    const startTime = Date.now();
    await Promise.all(operations);
    const duration = Date.now() - startTime;
    
    // Concurrent operations should complete faster than sequential
    expect(duration).toBeLessThan(5000);
  });
});
```

## Migration and Synchronization

### Migration Strategy

```typescript
class ProjectMigrator {
  async migrateProject(
    sourceProjectId: string,
    sourcePlatform: string,
    targetPlatform: string,
    options?: MigrationOptions
  ): Promise<MigrationResult> {
    const result: MigrationResult = {
      status: 'pending',
      sourceProjectId,
      targetProjectId: null,
      itemsMigrated: 0,
      errors: [],
      warnings: []
    };
    
    try {
      // 1. Fetch source project
      const sourceProject = await this.getProject(sourceProjectId, sourcePlatform);
      
      // 2. Create target project
      const targetProject = await this.createProject(
        this.transformProjectForPlatform(sourceProject, targetPlatform),
        targetPlatform
      );
      result.targetProjectId = targetProject.id;
      
      // 3. Migrate custom fields
      const fieldMapping = await this.migrateFields(
        sourceProject.id,
        targetProject.id,
        sourcePlatform,
        targetPlatform
      );
      
      // 4. Migrate issues in batches
      const issues = await this.getAllIssues(sourceProject.id, sourcePlatform);
      
      for (const batch of this.batchItems(issues, 50)) {
        const migratedIssues = await this.migrateIssueBatch(
          batch,
          targetProject.id,
          targetPlatform,
          fieldMapping
        );
        result.itemsMigrated += migratedIssues.length;
      }
      
      // 5. Migrate workflows if supported
      if (this.supportsWorkflows(targetPlatform)) {
        await this.migrateWorkflow(
          sourceProject.id,
          targetProject.id,
          sourcePlatform,
          targetPlatform
        );
      }
      
      result.status = 'success';
    } catch (error) {
      result.status = 'failed';
      result.errors.push(error.message);
    }
    
    return result;
  }
  
  private async migrateFields(
    sourceProjectId: string,
    targetProjectId: string,
    sourcePlatform: string,
    targetPlatform: string
  ): Promise<Map<string, string>> {
    const fieldMapping = new Map<string, string>();
    const sourceFields = await this.getFields(sourceProjectId, sourcePlatform);
    
    for (const field of sourceFields) {
      try {
        const targetField = await this.createField(
          targetProjectId,
          this.transformFieldForPlatform(field, targetPlatform),
          targetPlatform
        );
        fieldMapping.set(field.id, targetField.id);
      } catch (error) {
        // Log warning but continue migration
        console.warn(`Failed to migrate field ${field.name}: ${error.message}`);
      }
    }
    
    return fieldMapping;
  }
}
```

### Synchronization Engine

```typescript
class SynchronizationEngine {
  private syncJobs: Map<string, SyncJob> = new Map();
  
  async setupBidirectionalSync(
    project1: { id: string; platform: string },
    project2: { id: string; platform: string },
    options?: SyncOptions
  ): Promise<string> {
    const syncId = generateSyncId();
    
    const syncJob: SyncJob = {
      id: syncId,
      project1,
      project2,
      direction: options?.direction || 'bidirectional',
      frequency: options?.frequency || 'realtime',
      conflictResolution: options?.conflictResolution || 'latest-wins',
      filters: options?.filters,
      status: 'active',
      lastSync: new Date()
    };
    
    this.syncJobs.set(syncId, syncJob);
    
    // Setup webhooks for real-time sync
    if (syncJob.frequency === 'realtime') {
      await this.setupWebhooks(syncJob);
    } else {
      // Schedule periodic sync
      this.scheduleSync(syncJob);
    }
    
    return syncId;
  }
  
  private async syncChanges(syncJob: SyncJob): Promise<void> {
    const changes1 = await this.getChangesSince(
      syncJob.project1,
      syncJob.lastSync
    );
    
    const changes2 = await this.getChangesSince(
      syncJob.project2,
      syncJob.lastSync
    );
    
    // Detect and resolve conflicts
    const conflicts = this.detectConflicts(changes1, changes2);
    const resolved = await this.resolveConflicts(conflicts, syncJob.conflictResolution);
    
    // Apply changes
    if (syncJob.direction === 'bidirectional' || syncJob.direction === '1to2') {
      await this.applyChanges(changes1, syncJob.project2, resolved);
    }
    
    if (syncJob.direction === 'bidirectional' || syncJob.direction === '2to1') {
      await this.applyChanges(changes2, syncJob.project1, resolved);
    }
    
    syncJob.lastSync = new Date();
  }
  
  private detectConflicts(
    changes1: Change[],
    changes2: Change[]
  ): Conflict[] {
    const conflicts: Conflict[] = [];
    
    for (const change1 of changes1) {
      const change2 = changes2.find(c => 
        c.entityId === change1.entityId &&
        c.field === change1.field
      );
      
      if (change2) {
        conflicts.push({
          entityId: change1.entityId,
          field: change1.field,
          value1: change1.newValue,
          value2: change2.newValue,
          timestamp1: change1.timestamp,
          timestamp2: change2.timestamp
        });
      }
    }
    
    return conflicts;
  }
}
```

## Security Considerations

### Authentication Security

```typescript
class SecureCredentialStore {
  private encryptionKey: Buffer;
  private vault: Map<string, EncryptedCredential> = new Map();
  
  constructor() {
    // Use system keychain or environment variable for encryption key
    this.encryptionKey = this.getOrCreateEncryptionKey();
  }
  
  async storeCredential(platform: string, credential: any): Promise<void> {
    const encrypted = await this.encrypt(credential);
    
    this.vault.set(platform, {
      data: encrypted,
      createdAt: new Date(),
      lastUsed: new Date()
    });
    
    // Persist to secure storage
    await this.persistToKeychain(platform, encrypted);
  }
  
  async getCredential(platform: string): Promise<any> {
    const encrypted = this.vault.get(platform);
    
    if (!encrypted) {
      // Try to load from keychain
      const stored = await this.loadFromKeychain(platform);
      if (stored) {
        this.vault.set(platform, stored);
        return await this.decrypt(stored.data);
      }
      throw new Error(`No credentials found for ${platform}`);
    }
    
    encrypted.lastUsed = new Date();
    return await this.decrypt(encrypted.data);
  }
  
  private async encrypt(data: any): Promise<string> {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      iv
    );
    
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }
  
  private async decrypt(encryptedData: string): Promise<any> {
    const buffer = Buffer.from(encryptedData, 'base64');
    
    const iv = buffer.slice(0, 16);
    const authTag = buffer.slice(16, 32);
    const encrypted = buffer.slice(32);
    
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      iv
    );
    
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  }
}
```

### API Security

```typescript
class SecurityMiddleware {
  // Input validation
  validateInput(data: any, schema: any): void {
    const validator = new Ajv();
    const valid = validator.validate(schema, data);
    
    if (!valid) {
      throw new UnifiedError(
        ErrorType.VALIDATION,
        'Invalid input data',
        undefined,
        validator.errors
      );
    }
  }
  
  // Sanitize output
  sanitizeOutput(data: any): any {
    // Remove sensitive fields
    const sensitiveFields = [
      'password',
      'token',
      'apiKey',
      'secret',
      'credential'
    ];
    
    return this.removeSensitiveFields(data, sensitiveFields);
  }
  
  // Rate limiting per user/platform
  async checkRateLimit(userId: string, platform: string): Promise<void> {
    const key = `${userId}:${platform}`;
    const limit = this.getRateLimitForPlatform(platform);
    
    const current = await this.rateLimitStore.increment(key);
    
    if (current > limit) {
      throw new UnifiedError(
        ErrorType.RATE_LIMIT,
        'Rate limit exceeded',
        platform,
        undefined,
        true,
        60000
      );
    }
  }
  
  // Audit logging
  async logApiCall(context: ApiCallContext): Promise<void> {
    const logEntry = {
      timestamp: new Date(),
      userId: context.userId,
      platform: context.platform,
      operation: context.operation,
      parameters: this.sanitizeOutput(context.parameters),
      result: context.result ? 'success' : 'failure',
      error: context.error,
      duration: context.duration
    };
    
    await this.auditLogger.log(logEntry);
  }
}
```

## Performance Optimization

### Caching Strategy

```typescript
class MultiTierCache {
  private l1Cache: LRUCache<string, any>; // Memory
  private l2Cache: RedisClient;           // Redis
  private l3Cache: DiskCache;            // Disk
  
  constructor(config: CacheConfig) {
    this.l1Cache = new LRUCache({
      max: config.memorySize || 1000,
      ttl: config.memoryTTL || 5 * 60 * 1000
    });
    
    this.l2Cache = new RedisClient(config.redis);
    this.l3Cache = new DiskCache(config.diskPath);
  }
  
  async get(key: string): Promise<any> {
    // Check L1 (memory)
    let value = this.l1Cache.get(key);
    if (value) return value;
    
    // Check L2 (Redis)
    value = await this.l2Cache.get(key);
    if (value) {
      this.l1Cache.set(key, value);
      return value;
    }
    
    // Check L3 (disk)
    value = await this.l3Cache.get(key);
    if (value) {
      await this.promoteToUpperTiers(key, value);
      return value;
    }
    
    return null;
  }
  
  async set(
    key: string,
    value: any,
    options?: CacheOptions
  ): Promise<void> {
    const ttl = options?.ttl || this.getDefaultTTL(key);
    
    // Write to all tiers
    this.l1Cache.set(key, value, { ttl });
    await this.l2Cache.setex(key, ttl / 1000, JSON.stringify(value));
    
    if (options?.persistent) {
      await this.l3Cache.set(key, value);
    }
  }
  
  // Intelligent cache invalidation
  async invalidate(pattern: string): Promise<void> {
    // Clear from all tiers
    const keys = await this.findKeys(pattern);
    
    for (const key of keys) {
      this.l1Cache.delete(key);
      await this.l2Cache.del(key);
      await this.l3Cache.delete(key);
    }
  }
}
```

### Query Optimization

```typescript
class QueryOptimizer {
  // GraphQL query batching for GitHub
  async batchGraphQLQueries(queries: GraphQLQuery[]): Promise<any[]> {
    const batchedQuery = `
      query BatchedQuery {
        ${queries.map((q, i) => `
          query${i}: ${q.query}
        `).join('\n')}
      }
    `;
    
    const variables = queries.reduce((acc, q, i) => {
      Object.entries(q.variables || {}).forEach(([key, value]) => {
        acc[`${key}${i}`] = value;
      });
      return acc;
    }, {});
    
    const result = await this.graphqlClient.query(batchedQuery, variables);
    
    return queries.map((_, i) => result[`query${i}`]);
  }
  
  // JQL query optimization for Jira
  optimizeJQL(query: string): string {
    // Parse and optimize JQL
    const parsed = this.parseJQL(query);
    
    // Reorder clauses for better performance
    const optimized = this.reorderClauses(parsed);
    
    // Add index hints if available
    const withHints = this.addIndexHints(optimized);
    
    return this.buildJQL(withHints);
  }
  
  // Parallel query execution
  async executeParallelQueries<T>(
    queries: Array<() => Promise<T>>
  ): Promise<T[]> {
    const results = await Promise.allSettled(queries.map(q => q()));
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(`Query ${index} failed:`, result.reason);
        throw result.reason;
      }
    });
  }
}
```

### Connection Pooling

```typescript
class ConnectionPool {
  private pools: Map<string, Pool> = new Map();
  
  getPool(platform: string): Pool {
    if (!this.pools.has(platform)) {
      this.pools.set(platform, this.createPool(platform));
    }
    
    return this.pools.get(platform)!;
  }
  
  private createPool(platform: string): Pool {
    const config = this.getPoolConfig(platform);
    
    return new Pool({
      create: async () => {
        if (platform === 'github') {
          return new GitHubConnection(config);
        } else if (platform === 'jira') {
          return new JiraConnection(config);
        }
        throw new Error(`Unknown platform: ${platform}`);
      },
      destroy: async (connection) => {
        await connection.close();
      },
      validate: async (connection) => {
        return connection.isAlive();
      },
      min: config.minConnections || 2,
      max: config.maxConnections || 10,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 10000
    });
  }
  
  async executeWithConnection<T>(
    platform: string,
    operation: (conn: Connection) => Promise<T>
  ): Promise<T> {
    const pool = this.getPool(platform);
    const connection = await pool.acquire();
    
    try {
      return await operation(connection);
    } finally {
      await pool.release(connection);
    }
  }
}
```

## Conclusion

This comprehensive design document provides a complete blueprint for implementing a unified project management interface in Claude Flow that seamlessly integrates with both GitHub Projects and Jira APIs. The design emphasizes:

1. **Unified Abstraction**: A consistent API that hides platform complexity
2. **Extensibility**: Easy addition of new platforms through the adapter pattern
3. **Performance**: Optimized caching, connection pooling, and query batching
4. **Reliability**: Robust error handling and retry mechanisms
5. **Security**: Encrypted credential storage and comprehensive audit logging
6. **Flexibility**: Support for platform-specific features while maintaining consistency

The implementation plans provide detailed, step-by-step guidance for building both adapters with production-ready code examples, ensuring a smooth development process and high-quality outcome.

## Multi-Swarm Coordination Design

### Overview

The multi-swarm coordination system implements a "Pizza Team" architecture where autonomous swarms work on specific modules or features, coordinated through a central Project Management swarm with oversight from specialized Architecture, QA, and DevOps swarms.

### Core Concepts

#### Pizza Team Model
- **Small, Autonomous Teams**: Each swarm (pizza team) is small enough to be fed by 2 pizzas
- **Module Ownership**: Each team owns specific modules or features end-to-end
- **Self-Organizing**: Teams manage their own work within assigned tasks
- **Cross-Functional**: Teams include all skills needed for their module

### Swarm Types and Responsibilities

#### 1. Project Management Swarm
- **Sprint Planning**: Breaks down epics into stories and tasks
- **Task Distribution**: Assigns tasks to appropriate implementation swarms
- **Progress Tracking**: Monitors all swarm activities and progress
- **Dependency Management**: Coordinates inter-swarm dependencies
- **Resource Allocation**: Balances workload across swarms

#### 2. Architecture Swarm
- **Design Review**: Reviews and approves technical designs
- **API Contracts**: Defines and maintains inter-module contracts
- **Tech Stack Decisions**: Makes technology choices
- **Standards Enforcement**: Ensures architectural consistency
- **Optional Approval Gate**: Can block implementation if design is inadequate

#### 3. Implementation Swarms (Pizza Teams)
- **Feature Development**: Implements assigned features/modules
- **Unit Testing**: Writes and maintains unit tests
- **Code Review**: Internal team code reviews
- **PR Creation**: Creates pull requests for completed work
- **Module Expertise**: Deep knowledge of assigned module

#### 4. QA/Test Swarm
- **Test Planning**: Creates comprehensive test strategies
- **Integration Testing**: Validates inter-module interactions
- **Performance Testing**: Ensures performance requirements
- **Acceptance Testing**: Validates business requirements
- **PR Validation**: Final approval before merge

#### 5. DevOps Swarm
- **CI/CD Pipeline**: Maintains build and deployment pipelines
- **Infrastructure**: Manages cloud resources and scaling
- **Monitoring**: Sets up observability and alerting
- **Deployment**: Handles production deployments

### Swarm Coordination Protocol

```typescript
interface SwarmCoordinationSystem {
  // Swarm Registry
  swarms: {
    projectManagement: ProjectManagementSwarm;
    architecture: ArchitectureSwarm;
    qa: QASwarm;
    devops: DevOpsSwarm;
    implementation: Map<string, ImplementationSwarm>;
  };
  
  // Communication Channels
  channels: {
    taskAssignment: Channel;      // PM -> Implementation
    designReview: Channel;        // Implementation -> Architecture
    prValidation: Channel;        // Implementation -> QA
    statusReporting: Channel;     // All -> PM
    deploymentRequest: Channel;   // QA -> DevOps
  };
  
  // Coordination Rules
  rules: {
    architectureApprovalRequired: (task: Task) => boolean;
    qaValidationRequired: (pr: PullRequest) => boolean;
    autoAssignToSwarm: (task: Task) => string;
    escalationPath: (issue: Issue) => string[];
  };
}
```

### Sprint Workflow

#### Phase 1: Planning
1. **Epic Definition**: PM swarm receives epic from product owner
2. **Story Breakdown**: Epic decomposed into user stories
3. **Task Creation**: Stories broken into technical tasks
4. **Architecture Review**: Optional design review for complex features
5. **Team Assignment**: Tasks distributed to implementation swarms

#### Phase 2: Implementation
1. **Branch Creation**: Teams create feature branches
2. **Development**: Parallel development by multiple swarms
3. **Unit Testing**: Each swarm tests their code
4. **Code Review**: Internal team reviews
5. **PR Creation**: Pull requests created with swarm metadata

#### Phase 3: Validation
1. **QA Review**: QA swarm validates PRs
2. **Integration Testing**: Cross-module testing
3. **Performance Testing**: Load and stress testing
4. **Feedback Loop**: Issues sent back to implementation swarms

#### Phase 4: Deployment
1. **PR Approval**: QA approves validated PRs
2. **Merge**: PRs merged to main branch
3. **Deployment**: DevOps swarm deploys to production
4. **Monitoring**: Post-deployment monitoring

### Inter-Swarm Communication

```typescript
interface SwarmMessage {
  from: SwarmIdentity;
  to: SwarmIdentity | 'broadcast';
  type: MessageType;
  priority: 'low' | 'normal' | 'high' | 'critical';
  payload: any;
  
  // Message types
  messageTypes: {
    TASK_ASSIGNMENT: 'task-assignment';
    STATUS_UPDATE: 'status-update';
    BLOCKER_ALERT: 'blocker-alert';
    PR_READY: 'pr-ready';
    VALIDATION_RESULT: 'validation-result';
    DESIGN_REVIEW_REQUEST: 'design-review-request';
    DESIGN_REVIEW_RESPONSE: 'design-review-response';
    DEPENDENCY_UPDATE: 'dependency-update';
  };
  
  // Routing rules
  routing: {
    directMessage: boolean;
    requiresAck: boolean;
    timeout?: number;
    retryPolicy?: RetryPolicy;
  };
}

interface SwarmEventBus {
  // Publishing
  publish(event: SwarmEvent): void;
  broadcast(event: SwarmEvent): void;
  
  // Subscribing
  subscribe(eventType: string, handler: EventHandler): void;
  subscribePattern(pattern: RegExp, handler: EventHandler): void;
  
  // Request-Response
  request(target: SwarmIdentity, request: Request): Promise<Response>;
  
  // Event sourcing
  eventLog: EventStore;
  replay(from: Date, to: Date): Event[];
}
```

### Task Distribution Algorithm

```typescript
class TaskDistributor {
  distributesTasks(tasks: Task[], swarms: ImplementationSwarm[]): Distribution {
    const distribution = new Map<string, Task[]>();
    
    for (const task of tasks) {
      // Find swarm with module expertise
      const expertSwarm = this.findExpertSwarm(task.module, swarms);
      
      // Check swarm capacity
      if (this.hasCapacity(expertSwarm)) {
        this.assignToSwarm(task, expertSwarm, distribution);
      } else {
        // Find alternative swarm or queue
        const alternativeSwarm = this.findAlternativeSwarm(task, swarms);
        if (alternativeSwarm) {
          this.assignToSwarm(task, alternativeSwarm, distribution);
        } else {
          this.queueTask(task);
        }
      }
      
      // Handle dependencies
      this.mapDependencies(task, distribution);
    }
    
    return this.optimizeDistribution(distribution);
  }
  
  private findExpertSwarm(module: string, swarms: ImplementationSwarm[]): Swarm {
    return swarms.find(s => s.modules.includes(module)) || 
           swarms.find(s => s.canHandle(module));
  }
  
  private optimizeDistribution(distribution: Map<string, Task[]>): Distribution {
    // Balance load across swarms
    // Minimize cross-swarm dependencies
    // Optimize for parallel execution
    return this.loadBalancer.optimize(distribution);
  }
}
```

### Approval Gates

```typescript
interface ApprovalGate {
  type: 'architecture' | 'qa' | 'security' | 'product';
  required: boolean;
  blocking: boolean;
  
  // Approval process
  requestApproval(artifact: Artifact): Promise<ApprovalResult>;
  checkStatus(requestId: string): ApprovalStatus;
  
  // Approval criteria
  criteria: {
    architecture?: {
      designDocumentRequired: boolean;
      apiReviewRequired: boolean;
      securityReviewRequired: boolean;
    };
    qa?: {
      unitTestCoverage: number;      // e.g., 80%
      integrationTestsRequired: boolean;
      performanceTestsRequired: boolean;
      acceptanceTestsRequired: boolean;
    };
  };
}

class ArchitectureApprovalGate implements ApprovalGate {
  async requestApproval(design: DesignDocument): Promise<ApprovalResult> {
    const review = await this.architectureSwarm.review({
      design,
      impactAnalysis: this.analyzeImpact(design),
      riskAssessment: this.assessRisks(design)
    });
    
    if (review.approved) {
      return { approved: true, feedback: review.comments };
    }
    
    return {
      approved: false,
      blockers: review.issues,
      requiredChanges: review.suggestions,
      resubmitRequired: true
    };
  }
}
```

### Metrics and Monitoring

```typescript
interface SwarmMetrics {
  // Performance metrics
  performance: {
    tasksCompleted: number;
    averageTaskTime: Duration;
    velocity: number;
    throughput: number;
  };
  
  // Quality metrics
  quality: {
    defectRate: number;
    testCoverage: number;
    codeReviewTurnaround: Duration;
    prRejectionRate: number;
  };
  
  // Collaboration metrics
  collaboration: {
    interSwarmMessages: number;
    dependencyBlocks: number;
    averageBlockResolution: Duration;
    crossSwarmPRs: number;
  };
  
  // Health metrics
  health: {
    swarmUtilization: number;
    queueDepth: number;
    blockedTasks: number;
    criticalIssues: number;
  };
}

class SwarmMonitor {
  collectMetrics(): Map<string, SwarmMetrics> {
    const metrics = new Map();
    
    for (const [swarmId, swarm] of this.swarms) {
      metrics.set(swarmId, {
        performance: this.measurePerformance(swarm),
        quality: this.measureQuality(swarm),
        collaboration: this.measureCollaboration(swarm),
        health: this.measureHealth(swarm)
      });
    }
    
    return metrics;
  }
  
  detectAnomalies(metrics: SwarmMetrics): Anomaly[] {
    const anomalies = [];
    
    // Detect performance degradation
    if (metrics.performance.velocity < this.thresholds.minVelocity) {
      anomalies.push({ type: 'low-velocity', severity: 'warning' });
    }
    
    // Detect quality issues
    if (metrics.quality.defectRate > this.thresholds.maxDefectRate) {
      anomalies.push({ type: 'high-defect-rate', severity: 'critical' });
    }
    
    // Detect collaboration issues
    if (metrics.collaboration.dependencyBlocks > this.thresholds.maxBlocks) {
      anomalies.push({ type: 'excessive-blocking', severity: 'warning' });
    }
    
    return anomalies;
  }
}
```

### Integration with GitHub/Jira

```typescript
interface SwarmProjectIntegration {
  // Issue creation for swarms
  createSwarmIssue(task: Task, swarm: Swarm): Promise<Issue> {
    return this.platform.createIssue({
      title: task.title,
      description: task.description,
      labels: [`swarm:${swarm.id}`, `module:${task.module}`],
      customFields: {
        swarmId: swarm.id,
        swarmType: swarm.type,
        moduleOwner: swarm.moduleOwnership,
        dependencies: task.dependencies,
        approvalGates: task.requiredApprovals
      },
      assignee: swarm.leadDeveloper
    });
  }
  
  // PR metadata for swarm work
  createSwarmPR(pr: PullRequestData, swarm: Swarm): Promise<PullRequest> {
    return this.platform.createPR({
      ...pr,
      description: `
        ## Swarm: ${swarm.name}
        ## Module: ${swarm.moduleOwnership.join(', ')}
        ## Task: ${pr.task.id}
        
        ${pr.description}
        
        ### Approval Requirements
        - [ ] Architecture Review: ${pr.requiresArchitecture ? 'Required' : 'N/A'}
        - [ ] QA Validation: Required
        - [ ] Security Review: ${pr.requiresSecurity ? 'Required' : 'N/A'}
      `,
      metadata: {
        swarmId: swarm.id,
        moduleOwnership: swarm.moduleOwnership,
        taskId: pr.task.id,
        epicId: pr.task.epicId,
        approvalStatus: {
          architecture: 'pending',
          qa: 'pending'
        }
      }
    });
  }
  
  // Sprint board visualization
  updateSprintBoard(swarmProgress: Map<string, SwarmProgress>): void {
    for (const [swarmId, progress] of swarmProgress) {
      // Update swim lanes for each swarm
      this.board.updateSwimLane(swarmId, {
        todo: progress.todoTasks,
        inProgress: progress.inProgressTasks,
        review: progress.inReviewTasks,
        testing: progress.inTestingTasks,
        done: progress.completedTasks
      });
      
      // Update metrics
      this.board.updateMetrics(swarmId, {
        velocity: progress.velocity,
        burndown: progress.burndown,
        blockers: progress.blockers
      });
    }
  }
}
```

### Benefits of Multi-Swarm Coordination

1. **Scalability**: Add swarms as the project grows
2. **Autonomy**: Teams self-organize within their domain
3. **Specialization**: Deep expertise in specific modules
4. **Parallel Execution**: Multiple swarms work simultaneously
5. **Quality Assurance**: Built-in approval gates ensure quality
6. **Clear Ownership**: Each swarm owns their modules end-to-end
7. **Efficient Communication**: Structured inter-swarm protocols
8. **Rapid Iteration**: Quick feedback loops within swarms

This multi-swarm architecture enables large-scale software development with autonomous teams while maintaining coordination, quality, and architectural consistency.