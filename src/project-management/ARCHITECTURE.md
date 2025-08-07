# C4 Architecture Model - Unified Project Management Interface

This document describes the architecture of the Unified Project Management Interface using the C4 model (Context, Containers, Components, and Code).

## Level 1: System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                SYSTEM CONTEXT                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────┐                                                 ┌─────────────┐   │
│  │   Users     │◄────────────── Unified API ──────────────────►│   Claude    │   │
│  │             │                                                 │    Flow     │   │
│  │ - Developers│                                                 │    Core     │   │
│  │ - PMs       │                                                 │             │   │
│  │ - Teams     │                                                 └─────────────┘   │
│  └─────────────┘                                                                   │
│                                                                                     │
│       │                                                                 │           │
│       │                                                                 │           │
│       ▼                                                                 ▼           │
│  ┌─────────────┐                ┌─────────────────┐                ┌─────────────┐   │
│  │   Third-    │◄──────────────►│   Unified       │◄──────────────►│  External   │   │
│  │   Party     │   Webhooks/    │   Project       │   Platform     │  Services   │   │
│  │   Tools     │   Events       │   Management    │   APIs         │             │   │
│  │             │                │   Interface     │                │ - GitHub    │   │
│  │ - Slack     │                │                 │                │ - Jira      │   │
│  │ - Teams     │                │                 │                │ - Azure DO  │   │
│  │ - Email     │                └─────────────────┘                │ - Linear    │   │
│  │ - Webhooks  │                                                   │ - Asana     │   │
│  └─────────────┘                                                   └─────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Relationships:
- **Users**: Developers, Project Managers, and Teams interact with the system through Claude Flow
- **Claude Flow Core**: Main system that provides unified project management capabilities
- **External Services**: Various project management platforms (GitHub, Jira, Azure DevOps, etc.)
- **Third-Party Tools**: Integration with notification systems, automation tools, and webhooks

## Level 2: Container Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              UNIFIED PROJECT MANAGEMENT                              │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐                    │
│  │   Web Client    │    │   CLI Client    │    │  Plugin Host    │                    │
│  │                 │    │                 │    │                 │                    │
│  │ - Dashboard     │    │ - Commands      │    │ - Custom Plugins│                    │
│  │ - Settings      │    │ - Scripts       │    │ - Extensions    │                    │
│  │ - Monitoring    │    │ - Automation    │    │ - Integrations  │                    │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘                    │
│           │                       │                       │                           │
│           └───────────────────────┼───────────────────────┘                           │
│                                   │                                                   │
│                                   ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                          Unified Project Manager                                │ │
│  │                                                                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │ │
│  │  │    Auth     │  │   Event     │  │   Config    │  │   Plugin    │            │ │
│  │  │   Manager   │  │  Manager    │  │  Manager    │  │  Manager    │            │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘            │ │
│  │                                                                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │ │
│  │  │   GitHub    │  │    Jira     │  │  Azure DO   │  │   Linear    │            │ │
│  │  │   Adapter   │  │   Adapter   │  │   Adapter   │  │   Adapter   │            │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘            │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                                   │
│                                   ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                            Data Layer                                           │ │
│  │                                                                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │ │
│  │  │   Cache     │  │   Config    │  │    Auth     │  │   Events    │            │ │
│  │  │   Store     │  │   Store     │  │   Store     │  │    Store    │            │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘            │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Container Responsibilities:

1. **Web Client**: Browser-based interface for configuration and monitoring
2. **CLI Client**: Command-line interface for automation and scripting
3. **Plugin Host**: Runtime environment for custom plugins and extensions
4. **Unified Project Manager**: Core orchestration and business logic
5. **Data Layer**: Persistent storage for configuration, cache, and events

## Level 3: Component Diagram - Core System

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                           UNIFIED PROJECT MANAGER                                   │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                           API Gateway Layer                                     │ │
│  │                                                                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │ │
│  │  │  REST API   │  │ GraphQL API │  │ WebSocket   │  │ Webhook     │            │ │
│  │  │  Handler    │  │  Handler    │  │  Handler    │  │  Handler    │            │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘            │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                          Orchestration Layer                                   │ │
│  │                                                                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │ │
│  │  │  Request    │  │ Cross-      │  │ Operation   │  │  Result     │            │ │
│  │  │ Dispatcher  │  │ Platform    │  │ Executor    │  │ Aggregator  │            │ │
│  │  │             │  │ Coordinator │  │             │  │             │            │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘            │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                        Management Services Layer                               │ │
│  │                                                                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │ │
│  │  │    Auth     │  │   Event     │  │   Config    │  │   Plugin    │            │ │
│  │  │  Manager    │  │  Manager    │  │  Manager    │  │  Manager    │            │ │
│  │  │             │  │             │  │             │  │             │            │ │
│  │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │            │ │
│  │  │ │ Token   │ │  │ │ Event   │ │  │ │ Env     │ │  │ │ Plugin  │ │            │ │
│  │  │ │Refresh  │ │  │ │Buffer   │ │  │ │Override │ │  │ │Sandbox  │ │            │ │
│  │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │            │ │
│  │  │             │  │             │  │             │  │             │            │ │
│  │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │            │ │
│  │  │ │ Creds   │ │  │ │ Event   │ │  │ │ File    │ │  │ │ Lifecycle│ │            │ │
│  │  │ │Security │ │  │ │Routing  │ │  │ │Watcher  │ │  │ │Manager  │ │            │ │
│  │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │            │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘            │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                         Platform Adapters Layer                               │ │
│  │                                                                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │ │
│  │  │   GitHub    │  │    Jira     │  │ Azure DO    │  │   Custom    │            │ │
│  │  │   Adapter   │  │   Adapter   │  │  Adapter    │  │   Adapter   │            │ │
│  │  │             │  │             │  │             │  │             │            │ │
│  │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │            │ │
│  │  │ │GraphQL  │ │  │ │REST API │ │  │ │REST API │ │  │ │Plugin   │ │            │ │
│  │  │ │Client   │ │  │ │Client   │ │  │ │Client   │ │  │ │Based    │ │            │ │
│  │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │            │ │
│  │  │             │  │             │  │             │  │             │            │ │
│  │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │            │ │
│  │  │ │Webhook  │ │  │ │Webhook  │ │  │ │Service  │ │  │ │Dynamic  │ │            │ │
│  │  │ │Handler  │ │  │ │Handler  │ │  │ │Bus      │ │  │ │Loading  │ │            │ │
│  │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │            │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘            │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                         Infrastructure Layer                                   │ │
│  │                                                                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │ │
│  │  │   Cache     │  │ Connection  │  │  Security   │  │ Monitoring  │            │ │
│  │  │  Manager    │  │    Pool     │  │  Manager    │  │  & Logging  │            │ │
│  │  │             │  │             │  │             │  │             │            │ │
│  │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │            │ │
│  │  │ │Multi-   │ │  │ │HTTP     │ │  │ │Rate     │ │  │ │Metrics  │ │            │ │
│  │  │ │Level    │ │  │ │Pool     │ │  │ │Limiter  │ │  │ │Collector│ │            │ │
│  │  │ │Cache    │ │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │            │ │
│  │  │ └─────────┘ │  │             │  │             │  │             │            │ │
│  │  │             │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │            │ │
│  │  │ ┌─────────┐ │  │ │Circuit  │ │  │ │Input    │ │  │ │Health   │ │            │ │
│  │  │ │TTL      │ │  │ │Breaker  │ │  │ │Validator│ │  │ │Checker  │ │            │ │
│  │  │ │Manager  │ │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │            │ │
│  │  │ └─────────┘ │  │             │  │             │  │             │            │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘            │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Interactions:

1. **API Gateway Layer**: Handles different types of client requests and protocols
2. **Orchestration Layer**: Manages request flow, cross-platform coordination, and result aggregation
3. **Management Services Layer**: Provides core services for auth, events, config, and plugins
4. **Platform Adapters Layer**: Interfaces with external project management platforms
5. **Infrastructure Layer**: Provides foundational services like caching, security, and monitoring

## Level 4: Code Diagram - Platform Adapter

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              PLATFORM ADAPTER                                       │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                         PlatformAdapter Interface                              │ │
│  │                                                                                 │ │
│  │  + platform: ProjectPlatform                                                   │ │
│  │  + capabilities: PlatformCapabilities                                          │ │
│  │  + connect(config: AuthConfig): Promise<void>                                  │ │
│  │  + disconnect(): Promise<void>                                                 │ │
│  │  + createProject(request: CreateProjectRequest): Promise<Project>             │ │
│  │  + getProject(id: string): Promise<Project | null>                            │ │
│  │  + updateProject(id: string, request: UpdateProjectRequest): Promise<Project> │ │
│  │  + deleteProject(id: string): Promise<void>                                   │ │
│  │  + listProjects(query?: ProjectQuery): Promise<Project[]>                     │ │
│  │  + createIssue(request: CreateIssueRequest): Promise<Issue>                   │ │
│  │  + getIssue(id: string): Promise<Issue | null>                                │ │
│  │  + updateIssue(id: string, request: UpdateIssueRequest): Promise<Issue>       │ │
│  │  + deleteIssue(id: string): Promise<void>                                     │ │
│  │  + listIssues(query?: IssueQuery): Promise<Issue[]>                           │ │
│  │  + bulkUpdateIssues(operation: BulkOperation): Promise<Issue[]>               │ │
│  │  + searchIssues(query: string, filters?: any): Promise<Issue[]>               │ │
│  │  + registerWebhook(config: WebhookConfig): Promise<string>                    │ │
│  │  + handleWebhookEvent(event: any): Promise<ProjectEvent>                      │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                       △                                               │
│                                       │                                               │
│                                   implements                                         │
│                                       │                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                            GitHubAdapter                                        │ │
│  │                                                                                 │ │
│  │  - octokit: Octokit                                                            │ │
│  │  - config: GitHubConfig                                                        │ │
│  │  - isConnected: boolean                                                        │ │
│  │                                                                                 │ │
│  │  + connect(authConfig: AuthConfig): Promise<void>                              │ │
│  │  + testConnection(): Promise<boolean>                                          │ │
│  │  + createProject(request: CreateProjectRequest): Promise<Project>             │ │
│  │  + getProject(id: string): Promise<Project | null>                            │ │
│  │  - mapGitHubProjectToProject(githubProject: GitHubProjectV2): Project         │ │
│  │  - mapGitHubIssueToIssue(githubIssue: GitHubIssue): Issue                     │ │
│  │  - buildGraphQLQuery(query: ProjectQuery): string                             │ │
│  │  - parseProjectId(projectId: string): [string, string]                        │ │
│  │  - handleRateLimit(response: Response): Promise<void>                         │ │
│  │                                                                                 │ │
│  │  GitHubProjectV2 ┌──────────┐ GitHubIssue ┌──────────┐ GitHubWorkflow          │ │
│  │  - id: string    │          │ - id: string │          │ - id: string            │ │
│  │  - title: string │ contains │ - title: str │ contains │ - name: string          │ │
│  │  - body: string  │          │ - body: str  │          │ - statuses: Status[]    │ │
│  │  - state: string └──────────┘ - state: str └──────────┘ - transitions: Trans[] │ │
│  │  - url: string                - labels: []              - isActive: boolean     │ │
│  │  - createdAt: str             - createdAt: str                                  │ │
│  │  - updatedAt: str             - updatedAt: str                                  │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                       △                                               │
│                                       │                                               │
│                                   implements                                         │
│                                       │                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                             JiraAdapter                                         │ │
│  │                                                                                 │ │
│  │  - config: JiraConfig                                                          │ │
│  │  - baseHeaders: Record<string, string>                                         │ │
│  │  - isConnected: boolean                                                        │ │
│  │                                                                                 │ │
│  │  + connect(authConfig: AuthConfig): Promise<void>                              │ │
│  │  + testConnection(): Promise<boolean>                                          │ │
│  │  + createProject(request: CreateProjectRequest): Promise<Project>             │ │
│  │  + getProject(id: string): Promise<Project | null>                            │ │
│  │  - mapJiraProjectToProject(jiraProject: JiraProject): Project                 │ │
│  │  - mapJiraIssueToIssue(jiraIssue: JiraIssue): Issue                           │ │
│  │  - buildJQL(query: IssueQuery): string                                        │ │
│  │  - request(method: string, endpoint: string, body?: any): Promise<Response>   │ │
│  │  - handleJiraError(error: any): Error                                         │ │
│  │                                                                                 │ │
│  │  JiraProject ┌─────────────┐ JiraIssue ┌─────────────┐ JiraWorkflow            │ │
│  │  - id: string│             │- id: string│             │- id: WorkflowId         │ │
│  │  - key: str  │   contains  │- key: str  │   contains  │- description: string    │ │
│  │  - name: str │             │- fields: { │             │- statuses: Status[]     │ │
│  │  - desc: str └─────────────┘  summary: str}          │- transitions: Trans[]   │ │
│  │  - lead: User                  description: str       │- rules: Rule[]          │ │
│  │  - url: string                 status: Status    └─────────────┘ - isActive: bool    │ │
│  │                                 assignee: User                                 │ │
│  │                                 labels: string[]                               │ │
│  │                                 created: string                                │ │
│  │                                 updated: string                                │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Code Components:

1. **PlatformAdapter Interface**: Defines the contract all adapters must implement
2. **Platform-Specific Adapters**: Implement the interface for each platform
3. **Data Models**: Platform-specific data structures that are mapped to unified models
4. **Transformation Methods**: Convert between platform formats and unified formats
5. **Connection Management**: Handle authentication, rate limiting, and error handling

## Data Flow Patterns

### 1. Unified Operation Flow
```
Request → Validation → Platform Selection → Adapter → Platform API → Response Transformation → Unified Response
```

### 2. Cross-Platform Query Flow
```
Query → Platform Distribution → Parallel Execution → Result Collection → Aggregation → Merged Response
```

### 3. Event Processing Flow
```
Platform Event → Webhook → Event Transformation → Filtering → Routing → Handler Execution → Actions
```

### 4. Authentication Flow
```
Auth Request → Credential Validation → Token Management → Platform Connection → Permission Check → Success
```

## Security Architecture

### 1. Defense in Depth
- **API Gateway**: Rate limiting, input validation, CORS
- **Authentication**: Multi-factor, token rotation, encryption
- **Platform Access**: Least privilege, scoped permissions
- **Plugin System**: Sandboxing, permission model
- **Data Protection**: Encryption at rest, secure transmission

### 2. Trust Boundaries
- **External Platforms**: Untrusted, validate all responses
- **Plugin Code**: Sandboxed, restricted API access
- **User Input**: Sanitized, validated against schemas
- **Configuration**: Encrypted sensitive values
- **Inter-Service**: Authenticated, authorized communication

## Scalability Considerations

### 1. Horizontal Scaling
- **Stateless Design**: All components designed to be stateless
- **Load Balancing**: Distribute requests across instances
- **Caching Strategy**: Multi-level caching for performance
- **Database Sharding**: Partition data by platform or tenant

### 2. Performance Optimization
- **Connection Pooling**: Reuse HTTP connections to platforms
- **Batch Operations**: Group operations where possible
- **Async Processing**: Non-blocking operations throughout
- **Circuit Breakers**: Prevent cascade failures

### 3. Monitoring and Observability
- **Distributed Tracing**: Track requests across components
- **Metrics Collection**: Performance and business metrics
- **Health Checks**: Component and platform health monitoring
- **Alerting**: Proactive issue detection and notification

This C4 architecture provides a comprehensive view of the Unified Project Management Interface, from high-level context down to implementation details, ensuring clear communication of the system's design and facilitating effective development and maintenance.

## Development Roadmap

### Phase 1: Single Repository Projects (Weeks 1-4)
**Goal**: Support project management within a single repository context

**Deliverables**:
- Basic GitHub Projects and Jira adapter implementations
- Single repository issue tracking and management
- Basic field mapping between platforms
- Simple status transitions and workflows
- Issue metadata includes branch references when moved from backlog
- Automatic branch tagging: `feature/{issue-id}`, `bug/{issue-id}`

**Branch Metadata Format**:
```typescript
interface IssueBranchMetadata {
  branchName: string;        // e.g., "feature/PROJ-123-user-auth"
  branchUrl: string;         // Full URL to branch
  createdAt: Date;
  lastCommit?: string;       // SHA of latest commit
  pullRequest?: {
    number: number;
    url: string;
    status: 'open' | 'closed' | 'merged';
  };
}
```

### Phase 2: Multi-Repository Single Project (Weeks 5-8)
**Goal**: Support projects spanning multiple repositories within a single project context

**Deliverables**:
- Multi-repository issue aggregation
- Cross-repository search and filtering
- Repository-aware branch naming conventions
- Consolidated project views across repositories
- Enhanced branch metadata with repository context
- Support for monorepo and polyrepo architectures

**Enhanced Metadata**:
```typescript
interface MultiRepoBranchMetadata extends IssueBranchMetadata {
  repository: {
    name: string;
    url: string;
    defaultBranch: string;
  };
  relatedBranches?: Array<{
    repository: string;
    branchName: string;
    url: string;
  }>;
}
```

### Phase 3: Multi-Repository Linked Projects (Weeks 9-12)
**Goal**: Support complex project hierarchies with inter-project dependencies

**Deliverables**:
- Project dependency management
- Cross-project issue linking
- Hierarchical branching strategies for Jira epics
- Automated parent/child branch creation
- Inter-project synchronization
- Advanced workflow orchestration

**Hierarchical Branching Strategy**:
```typescript
interface HierarchicalBranching {
  // For Jira Epic/Story/Task hierarchy
  epic?: {
    branchName: string;      // e.g., "epic/PROJ-100-payment-system"
    childBranches: Array<{
      type: 'story' | 'task' | 'bug';
      branchName: string;    // e.g., "story/PROJ-101-from-epic-100"
      parentBranch: string;  // Points to epic branch
    }>;
  };
  
  // Automatic branch creation rules
  branchingRules: {
    createParentBranch: boolean;     // Auto-create epic branch
    branchFromParent: boolean;       // Child branches from parent
    namingPattern: string;            // Template for branch names
    autoLinkPullRequests: boolean;   // Link PRs in hierarchy
  };
}
```

**Automatic Branch Management**:
- When an epic is moved from backlog, create parent branch: `epic/{epic-id}`
- When stories/tasks under epic are started, branch from epic: `story/{issue-id}-from-{epic-id}`
- Maintain branch hierarchy metadata in issue custom fields
- Support automatic PR chain creation for hierarchical merges

**Issue Metadata Enhancement**:
```typescript
interface EnhancedIssueMetadata {
  // Core branch information
  branch: IssueBranchMetadata | MultiRepoBranchMetadata;
  
  // Work tracking
  workState: {
    inBacklog: boolean;
    activeBranch?: string;
    commits: number;
    lastActivity: Date;
  };
  
  // Hierarchical context (for Jira)
  hierarchy?: {
    parentIssue?: string;
    parentBranch?: string;
    childIssues: string[];
    childBranches: string[];
  };
  
  // Links for agent inspection
  links: {
    branch: string;
    commits: string;
    pullRequest?: string;
    ciStatus?: string;
  };
  
  // Custom fields for platform-specific data
  platformMetadata: Record<string, any>;
}
```

**Agent Inspection Interface**:
Other agents inspecting issues can access work state through:
1. Issue description/body containing branch links
2. Custom fields with branch metadata
3. Comments with automated status updates
4. Labels/tags indicating work state
5. Webhook events for real-time updates

This phased approach ensures progressive enhancement of capabilities while maintaining stability and allowing for iterative feedback and refinement.

## Multi-Swarm Coordination Architecture

### Overview
The multi-swarm coordination system implements a hierarchical team structure where specialized swarms (Pizza Teams) work on specific modules or features, coordinated by a Project Management swarm with oversight from Architecture and QA teams.

### Swarm Team Structure

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                        MULTI-SWARM COORDINATION SYSTEM                              │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                      PROJECT MANAGEMENT SWARM                               │   │
│  │                                                                             │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │ Sprint       │  │ Task         │  │ Resource     │  │ Delivery     │  │   │
│  │  │ Planning     │  │ Assignment   │  │ Allocation   │  │ Tracking     │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                                │
│                    ┌───────────────┼───────────────┐                               │
│                    │               │               │                               │
│                    ▼               ▼               ▼                               │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐      │
│  │  ARCHITECTURE SWARM  │ │    QA/TEST SWARM     │ │   DEVOPS SWARM       │      │
│  │                      │ │                      │ │                      │      │
│  │  • Design Review     │ │  • Test Planning     │ │  • CI/CD Pipeline    │      │
│  │  • Tech Decisions    │ │  • Validation        │ │  • Deployment        │      │
│  │  • API Contracts     │ │  • Integration Tests │ │  • Monitoring        │      │
│  │  • Standards         │ │  • Performance Tests │ │  • Infrastructure    │      │
│  └──────────────────────┘ └──────────────────────┘ └──────────────────────┘      │
│            │                         │                         │                    │
│            └─────────────────────────┼─────────────────────────┘                   │
│                                      │                                             │
│                                      ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                         IMPLEMENTATION SWARMS (Pizza Teams)                  │  │
│  │                                                                             │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐               │  │
│  │  │ AUTH MODULE    │  │ PAYMENT MODULE │  │ USER INTERFACE │               │  │
│  │  │ Code Team #1   │  │ Code Team #2   │  │ Code Team #3   │               │  │
│  │  │                │  │                │  │                │               │  │
│  │  │ • Feature Dev  │  │ • Feature Dev  │  │ • Feature Dev  │               │  │
│  │  │ • Unit Tests   │  │ • Unit Tests   │  │ • Unit Tests   │               │  │
│  │  │ • Code Review  │  │ • Code Review  │  │ • Code Review  │               │  │
│  │  │ • PR Creation  │  │ • PR Creation  │  │ • PR Creation  │               │  │
│  │  └────────────────┘  └────────────────┘  └────────────────┘               │  │
│  │                                                                             │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐               │  │
│  │  │ DATA LAYER     │  │ API GATEWAY    │  │ NOTIFICATIONS  │               │  │
│  │  │ Code Team #4   │  │ Code Team #5   │  │ Code Team #6   │               │  │
│  │  │                │  │                │  │                │               │  │
│  │  │ • Feature Dev  │  │ • Feature Dev  │  │ • Feature Dev  │               │  │
│  │  │ • Unit Tests   │  │ • Unit Tests   │  │ • Unit Tests   │               │  │
│  │  │ • Code Review  │  │ • Code Review  │  │ • Code Review  │               │  │
│  │  │ • PR Creation  │  │ • PR Creation  │  │ • PR Creation  │               │  │
│  │  └────────────────┘  └────────────────┘  └────────────────┘               │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Sprint Workflow with Multi-Swarm Coordination

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                          SPRINT WORKFLOW COORDINATION                                │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  Sprint Planning                                                                    │
│  ┌─────────────┐                                                                   │
│  │   Define    │──────► Epic/Story Creation                                       │
│  │   Sprint    │        └──► Task Breakdown                                       │
│  │    Goals    │             └──► Team Assignment                                 │
│  └─────────────┘                                                                   │
│        │                                                                           │
│        ▼                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐              │
│  │                    ARCHITECTURE REVIEW GATE                      │              │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                │              │
│  │  │  Design    │  │   API      │  │  Security  │                │              │
│  │  │  Document  │──►│   Review   │──►│   Review   │──► Approved?  │              │
│  │  └────────────┘  └────────────┘  └────────────┘                │              │
│  └─────────────────────────────────────────────────────────────────┘              │
│                                │                                                   │
│                                ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐              │
│  │                    IMPLEMENTATION PHASE                          │              │
│  │                                                                  │              │
│  │   Code Team #1          Code Team #2          Code Team #N      │              │
│  │   ┌──────────┐         ┌──────────┐         ┌──────────┐      │              │
│  │   │ Feature  │         │ Feature  │         │ Feature  │      │              │
│  │   │   Dev    │         │   Dev    │         │   Dev    │      │              │
│  │   └────┬─────┘         └────┬─────┘         └────┬─────┘      │              │
│  │        │                     │                     │            │              │
│  │        ▼                     ▼                     ▼            │              │
│  │   ┌──────────┐         ┌──────────┐         ┌──────────┐      │              │
│  │   │   Unit   │         │   Unit   │         │   Unit   │      │              │
│  │   │  Testing │         │  Testing │         │  Testing │      │              │
│  │   └────┬─────┘         └────┬─────┘         └────┬─────┘      │              │
│  │        │                     │                     │            │              │
│  │        ▼                     ▼                     ▼            │              │
│  │   ┌──────────┐         ┌──────────┐         ┌──────────┐      │              │
│  │   │    PR    │         │    PR    │         │    PR    │      │              │
│  │   │ Creation │         │ Creation │         │ Creation │      │              │
│  │   └────┬─────┘         └────┬─────┘         └────┬─────┘      │              │
│  └────────┼─────────────────────┼─────────────────────┼────────────┘              │
│           │                     │                     │                           │
│           └─────────────────────┼─────────────────────┘                           │
│                                 ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐              │
│  │                        QA VALIDATION GATE                        │              │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                │              │
│  │  │ Integration│  │ Performance│  │ Acceptance │                │              │
│  │  │   Tests    │──►│   Tests    │──►│   Tests   │──► Pass?      │              │
│  │  └────────────┘  └────────────┘  └────────────┘                │              │
│  └─────────────────────────────────────────────────────────────────┘              │
│                                │                                                   │
│                                ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐              │
│  │                    DEPLOYMENT PHASE                              │              │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                │              │
│  │  │   Merge    │  │   Deploy   │  │  Monitor   │                │              │
│  │  │    PRs     │──►│  to Prod   │──►│  & Alert  │                │              │
│  │  └────────────┘  └────────────┘  └────────────┘                │              │
│  └─────────────────────────────────────────────────────────────────┘              │
│                                                                                    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Swarm Communication Protocol

```typescript
interface SwarmCoordinationProtocol {
  // Swarm Identity
  swarmId: string;
  swarmType: 'project-mgmt' | 'architecture' | 'implementation' | 'qa' | 'devops';
  moduleOwnership: string[];  // Modules this swarm is responsible for
  
  // Task Management
  assignedTasks: Task[];
  taskStatus: Map<string, TaskStatus>;
  dependencies: Map<string, string[]>;  // Task dependencies across swarms
  
  // Communication Channels
  channels: {
    commands: EventEmitter;      // Receive commands from PM swarm
    status: EventEmitter;        // Report status to PM swarm
    collaboration: EventEmitter; // Inter-swarm communication
    approvals: EventEmitter;     // Architecture/QA approval requests
  };
  
  // Approval Gates
  approvalGates: {
    architecture?: {
      required: boolean;
      status: 'pending' | 'approved' | 'rejected';
      feedback?: string;
    };
    qa?: {
      required: boolean;
      status: 'pending' | 'passed' | 'failed';
      testResults?: TestResults;
    };
  };
  
  // Work Products
  pullRequests: PullRequest[];
  branches: BranchInfo[];
  artifacts: DeploymentArtifact[];
}

interface SwarmTask {
  id: string;
  swarmId: string;
  type: 'feature' | 'bug' | 'refactor' | 'test';
  epic?: string;
  story?: string;
  module: string;
  
  // Task lifecycle
  status: 'backlog' | 'design' | 'in-progress' | 'review' | 'testing' | 'done';
  
  // Approvals required
  requiresArchitectureApproval: boolean;
  requiresQAValidation: boolean;
  
  // Work tracking
  branch?: string;
  pullRequest?: string;
  commits: string[];
  
  // Inter-swarm dependencies
  dependsOn: string[];      // Task IDs from other swarms
  blockedBy: string[];      // Current blockers
  blocking: string[];       // Tasks this is blocking
}

interface SwarmOrchestrator {
  // Swarm registry
  swarms: Map<string, Swarm>;
  
  // Task distribution
  distributeEpic(epic: Epic): Map<string, Task[]>;
  assignTaskToSwarm(task: Task, swarmId: string): void;
  
  // Coordination
  coordinateDependencies(tasks: Task[]): DependencyGraph;
  resolveBlockers(taskId: string): void;
  
  // Approval workflow
  requestArchitectureApproval(design: DesignDoc): Promise<ApprovalResult>;
  requestQAValidation(pr: PullRequest): Promise<ValidationResult>;
  
  // Sprint management
  planSprint(goals: SprintGoals): SprintPlan;
  trackSprintProgress(): SprintMetrics;
  
  // Communication
  broadcastToSwarms(message: SwarmMessage): void;
  routeMessage(from: string, to: string, message: any): void;
}
```

### Implementation Example

```typescript
class ProjectManagementSwarm extends BaseSwarm {
  private implementationSwarms: Map<string, ImplementationSwarm>;
  private architectureSwarm: ArchitectureSwarm;
  private qaSwarm: QASwarm;
  
  async planSprint(epic: Epic): Promise<SprintPlan> {
    // Break down epic into stories and tasks
    const stories = await this.decomposeEpic(epic);
    const tasks = await this.createTasksFromStories(stories);
    
    // Distribute tasks to appropriate swarms
    const taskDistribution = new Map<string, Task[]>();
    
    for (const task of tasks) {
      const targetSwarm = this.selectSwarmForTask(task);
      
      // Request architecture review if needed
      if (task.requiresDesign) {
        const designApproval = await this.architectureSwarm.reviewDesign({
          task,
          proposedApproach: task.technicalApproach,
          impactedModules: task.modules
        });
        
        if (!designApproval.approved) {
          task.status = 'blocked';
          task.blockReason = designApproval.feedback;
          continue;
        }
      }
      
      // Assign to implementation swarm
      if (!taskDistribution.has(targetSwarm.id)) {
        taskDistribution.set(targetSwarm.id, []);
      }
      taskDistribution.get(targetSwarm.id)!.push(task);
    }
    
    // Send tasks to swarms
    for (const [swarmId, swarmTasks] of taskDistribution) {
      await this.implementationSwarms.get(swarmId)!.assignTasks(swarmTasks);
    }
    
    return {
      epic,
      stories,
      tasks: Array.from(taskDistribution.values()).flat(),
      swarmAssignments: taskDistribution,
      timeline: this.calculateTimeline(taskDistribution)
    };
  }
  
  async monitorProgress(): Promise<SprintProgress> {
    const progress = new Map<string, SwarmProgress>();
    
    // Collect progress from all swarms
    for (const [swarmId, swarm] of this.implementationSwarms) {
      const swarmProgress = await swarm.getProgress();
      progress.set(swarmId, swarmProgress);
      
      // Check for blockers
      if (swarmProgress.blockers.length > 0) {
        await this.resolveBlockers(swarmProgress.blockers);
      }
      
      // Route completed PRs to QA
      for (const pr of swarmProgress.completedPRs) {
        await this.qaSwarm.validatePR(pr);
      }
    }
    
    return this.aggregateProgress(progress);
  }
}

class ImplementationSwarm extends BaseSwarm {
  private module: string;
  private developers: Developer[];
  private activeTasks: Task[];
  
  async executeTask(task: Task): Promise<TaskResult> {
    // Create feature branch
    const branch = await this.createFeatureBranch(task);
    
    // Implement feature
    const implementation = await this.implementFeature(task, branch);
    
    // Run unit tests
    const testResults = await this.runUnitTests(implementation);
    
    if (!testResults.passed) {
      return { status: 'failed', reason: 'Unit tests failed' };
    }
    
    // Create pull request
    const pr = await this.createPullRequest({
      branch,
      task,
      description: this.generatePRDescription(task, implementation),
      reviewers: this.selectReviewers(task)
    });
    
    // Notify PM swarm
    await this.notifyProjectManagement({
      event: 'pr-created',
      task: task.id,
      pr: pr.url,
      readyForQA: true
    });
    
    return { status: 'completed', pr };
  }
}

class QASwarm extends BaseSwarm {
  async validatePR(pr: PullRequest): Promise<ValidationResult> {
    const validationPlan = this.createValidationPlan(pr);
    
    // Run integration tests
    const integrationResults = await this.runIntegrationTests(pr);
    
    // Run performance tests if needed
    let performanceResults;
    if (validationPlan.requiresPerformanceTest) {
      performanceResults = await this.runPerformanceTests(pr);
    }
    
    // Run acceptance tests
    const acceptanceResults = await this.runAcceptanceTests(pr);
    
    const allPassed = 
      integrationResults.passed && 
      (!performanceResults || performanceResults.passed) && 
      acceptanceResults.passed;
    
    // Report results
    await this.reportValidationResults({
      pr,
      passed: allPassed,
      integrationTests: integrationResults,
      performanceTests: performanceResults,
      acceptanceTests: acceptanceResults
    });
    
    if (allPassed) {
      await this.approvePR(pr);
    } else {
      await this.requestFixes(pr, this.identifyFailures(validationResults));
    }
    
    return { passed: allPassed, results: validationResults };
  }
}
```

### Benefits of Multi-Swarm Architecture

1. **Parallel Development**: Multiple teams work simultaneously on different modules
2. **Clear Ownership**: Each swarm owns specific modules or features
3. **Quality Gates**: Architecture review and QA validation ensure quality
4. **Scalability**: Add more swarms as the project grows
5. **Specialization**: Teams focus on their expertise area
6. **Coordination**: PM swarm ensures alignment and dependency management

### Integration with Project Management Platforms

The multi-swarm system integrates with GitHub/Jira through:
- Automatic issue creation for each swarm task
- PR linking to issues with swarm metadata
- Sprint board updates reflecting swarm progress
- Custom fields for swarm assignment and dependencies
- Webhook notifications for cross-swarm events