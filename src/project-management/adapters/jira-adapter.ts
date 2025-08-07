/**
 * Jira Adapter
 * 
 * Implements the PlatformAdapter interface for Atlassian Jira
 * Provides unified interface for Jira Projects, Issues, Boards, and Workflows
 */

import type {
  PlatformAdapter,
  PlatformCapabilities,
  AuthConfig,
  Project,
  Issue,
  Board,
  Workflow,
  ProjectQuery,
  IssueQuery,
  CreateProjectRequest,
  UpdateProjectRequest,
  CreateIssueRequest,
  UpdateIssueRequest,
  BulkOperation,
  Comment,
  CommentVisibility,
  Attachment,
  WebhookConfig,
  ProjectEvent,
  ProjectStatus,
  IssueType,
  Priority,
  ProjectType,
  BoardType,
  CreateBoardRequest,
  UpdateBoardRequest,
  WorkflowStatus,
  WorkflowTransition,
} from '../core/interfaces.js';

interface JiraConfig {
  baseUrl: string;
  username: string;
  token: string; // API token for cloud or password for server
  isCloud: boolean;
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
  description?: string;
  projectTypeKey: string;
  style: string;
  lead: {
    accountId: string;
    displayName: string;
  };
  url: string;
  insight?: {
    totalIssueCount: number;
    lastIssueUpdateTime: string;
  };
}

interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: {
      content: any[];
      type: string;
      version: number;
    };
    status: {
      id: string;
      name: string;
      statusCategory: {
        id: number;
        key: string;
        colorName: string;
        name: string;
      };
    };
    priority: {
      id: string;
      name: string;
      iconUrl: string;
    };
    issuetype: {
      id: string;
      name: string;
      iconUrl: string;
      hierarchyLevel: number;
    };
    assignee?: {
      accountId: string;
      displayName: string;
      emailAddress: string;
    };
    reporter: {
      accountId: string;
      displayName: string;
      emailAddress: string;
    };
    labels: string[];
    project: {
      id: string;
      key: string;
      name: string;
    };
    parent?: {
      id: string;
      key: string;
      fields: {
        summary: string;
      };
    };
    subtasks: {
      id: string;
      key: string;
      fields: {
        summary: string;
        status: {
          name: string;
        };
      };
    }[];
    created: string;
    updated: string;
    timetracking?: {
      originalEstimate?: string;
      remainingEstimate?: string;
      timeSpent?: string;
      originalEstimateSeconds?: number;
      remainingEstimateSeconds?: number;
      timeSpentSeconds?: number;
    };
    worklog?: {
      startAt: number;
      maxResults: number;
      total: number;
      worklogs: JiraWorklogEntry[];
    };
  };
}

interface JiraWorklogEntry {
  id: string;
  author: {
    accountId: string;
    displayName: string;
  };
  timeSpent: string;
  timeSpentSeconds: number;
  comment?: {
    content: any[];
    type: string;
    version: number;
  };
  started: string;
  created: string;
  updated: string;
}

interface JiraBoard {
  id: number;
  name: string;
  type: string;
  self: string;
  location: {
    projectId: number;
    projectKey: string;
    projectName: string;
  };
}

interface JiraWorkflow {
  id: {
    name: string;
    entityId: string;
  };
  description: string;
  transitions: JiraTransition[];
  statuses: JiraStatus[];
}

interface JiraStatus {
  id: string;
  name: string;
  statusCategory: {
    id: number;
    key: string;
    colorName: string;
    name: string;
  };
}

interface JiraTransition {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
  };
  hasScreen: boolean;
  isGlobal: boolean;
  isInitial: boolean;
  isAvailable: boolean;
  isConditional: boolean;
  fields?: Record<string, any>;
  expand?: string;
}

export class JiraAdapter implements PlatformAdapter {
  readonly platform = 'jira' as const;
  readonly name = 'Atlassian Jira';
  readonly version = '3.0.0';
  readonly capabilities: PlatformCapabilities;

  private config?: JiraConfig;
  private isConnected = false;
  private baseHeaders: Record<string, string> = {};

  constructor() {
    this.capabilities = {
      projects: {
        create: true,
        read: true,
        update: true,
        delete: true,
        list: true,
        search: true,
      },
      issues: {
        create: true,
        read: true,
        update: true,
        delete: true,
        list: true,
        search: true,
        bulk: true,
        hierarchy: true, // Full parent/child support
        links: true,
        timeTracking: true,
        customFields: true,
      },
      boards: {
        read: true,
        create: true,
        update: true,
        delete: true,
        customColumns: true,
        swimlanes: true,
        filters: true,
      },
      workflows: {
        read: true,
        create: true,
        update: true,
        transition: true,
        customStatuses: true,
        conditions: true,
        validators: true,
      },
      attachments: {
        upload: true,
        download: true,
        delete: true,
        maxSize: 10 * 1024 * 1024, // 10MB default
        allowedTypes: ['*'], // Configurable per Jira instance
      },
      comments: {
        create: true,
        update: true,
        delete: true,
        visibility: true,
        mentions: true,
      },
      webhooks: {
        register: true,
        unregister: true,
        events: [
          'project.created',
          'project.updated',
          'project.deleted',
          'issue.created',
          'issue.updated',
          'issue.deleted',
          'issue.transitioned',
          'comment.created',
          'comment.updated',
          'comment.deleted',
          'attachment.added',
          'attachment.removed',
          'workflow.updated',
        ],
        customEvents: true,
      },
      search: {
        projects: true,
        issues: true,
        customQuery: true, // JQL support
        savedQueries: true,
      },
      authentication: {
        types: ['token', 'basic', 'oauth'],
        scopes: ['read', 'write', 'admin'],
        refreshSupported: true,
      },
    };
  }

  // ========================================================================
  // CONNECTION MANAGEMENT
  // ========================================================================

  async connect(authConfig: AuthConfig): Promise<void> {
    if (authConfig.platform !== 'jira') {
      throw new Error('Invalid platform configuration for Jira adapter');
    }

    const baseUrl = authConfig.baseUrl;
    const username = authConfig.credentials.username;
    const token = authConfig.credentials.token;

    if (!baseUrl || !username || !token) {
      throw new Error('Jira baseUrl, username, and token are required');
    }

    this.config = {
      baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
      username,
      token,
      isCloud: baseUrl.includes('.atlassian.net'),
    };

    // Setup authentication headers
    const auth = Buffer.from(`${username}:${token}`).toString('base64');
    this.baseHeaders = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    this.config = undefined;
    this.baseHeaders = {};
    this.isConnected = false;
  }

  isConnected(): boolean {
    return this.isConnected;
  }

  async testConnection(): Promise<boolean> {
    if (!this.config) return false;

    try {
      const response = await this.request('GET', '/rest/api/3/myself');
      return response.ok;
    } catch {
      return false;
    }
  }

  // ========================================================================
  // PROJECT OPERATIONS
  // ========================================================================

  async createProject(request: CreateProjectRequest): Promise<Project> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const projectData = {
        key: this.generateProjectKey(request.title),
        name: request.title,
        description: request.description,
        projectTypeKey: this.mapProjectTypeToJira(request.type),
        projectTemplateKey: request.template || 'com.pyxis.greenhopper.jira:gh-simplified-agility-kanban',
        leadAccountId: await this.getCurrentUserAccountId(),
      };

      const response = await this.request('POST', '/rest/api/3/project', projectData);
      const jiraProject = await response.json() as JiraProject;

      return this.mapJiraProjectToProject(jiraProject);
    } catch (error) {
      throw new Error(`Failed to create Jira project: ${error}`);
    }
  }

  async getProject(id: string): Promise<Project | null> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const response = await this.request('GET', `/rest/api/3/project/${id}`);
      
      if (response.status === 404) {
        return null;
      }

      const jiraProject = await response.json() as JiraProject;
      return this.mapJiraProjectToProject(jiraProject);
    } catch (error) {
      throw new Error(`Failed to get Jira project: ${error}`);
    }
  }

  async updateProject(id: string, request: UpdateProjectRequest): Promise<Project> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const updateData: any = {};
      if (request.title) updateData.name = request.title;
      if (request.description) updateData.description = request.description;

      const response = await this.request('PUT', `/rest/api/3/project/${id}`, updateData);
      const jiraProject = await response.json() as JiraProject;

      return this.mapJiraProjectToProject(jiraProject);
    } catch (error) {
      throw new Error(`Failed to update Jira project: ${error}`);
    }
  }

  async deleteProject(id: string): Promise<void> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      await this.request('DELETE', `/rest/api/3/project/${id}`);
    } catch (error) {
      throw new Error(`Failed to delete Jira project: ${error}`);
    }
  }

  async listProjects(query?: ProjectQuery): Promise<Project[]> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      let url = '/rest/api/3/project/search';
      const params = new URLSearchParams();

      if (query?.search) {
        params.set('query', query.search);
      }

      if (query?.types && query.types.length > 0) {
        const jiraTypes = query.types.map(t => this.mapProjectTypeToJira(t));
        params.set('typeKey', jiraTypes.join(','));
      }

      if (query?.limit) {
        params.set('maxResults', query.limit.toString());
      }

      if (query?.offset) {
        params.set('startAt', query.offset.toString());
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await this.request('GET', url);
      const data = await response.json() as { values: JiraProject[] };

      let projects = data.values.map(p => this.mapJiraProjectToProject(p));

      // Apply additional filters
      if (query?.statuses && query.statuses.length > 0) {
        // Note: Jira projects don't have the same status concept as issues
        // This filter might not apply directly
      }

      // Apply sorting
      if (query?.sortBy) {
        projects.sort((a, b) => {
          let aValue: any, bValue: any;
          switch (query.sortBy) {
            case 'name':
              aValue = a.title;
              bValue = b.title;
              break;
            case 'created':
              aValue = a.createdAt;
              bValue = b.createdAt;
              break;
            case 'updated':
              aValue = a.updatedAt;
              bValue = b.updatedAt;
              break;
            default:
              return 0;
          }

          if (query.sortOrder === 'desc') {
            [aValue, bValue] = [bValue, aValue];
          }

          return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        });
      }

      return projects;
    } catch (error) {
      throw new Error(`Failed to list Jira projects: ${error}`);
    }
  }

  // ========================================================================
  // ISSUE OPERATIONS
  // ========================================================================

  async createIssue(request: CreateIssueRequest): Promise<Issue> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const fields: any = {
        project: { key: request.project },
        summary: request.title,
        description: this.formatDescription(request.description),
        issuetype: { name: this.mapIssueTypeToJira(request.type) },
        priority: { name: this.mapPriorityToJira(request.priority || 'medium') },
        labels: request.labels || [],
      };

      if (request.assignee) {
        fields.assignee = { accountId: request.assignee };
      }

      if (request.reporter) {
        fields.reporter = { accountId: request.reporter };
      }

      if (request.parent) {
        fields.parent = { key: request.parent };
      }

      if (request.epic) {
        fields.customfield_10014 = request.epic; // Epic Link field ID may vary
      }

      if (request.storyPoints) {
        fields.customfield_10016 = request.storyPoints; // Story Points field ID may vary
      }

      // Add custom fields
      if (request.customFields) {
        Object.assign(fields, request.customFields);
      }

      const issueData = { fields };
      const response = await this.request('POST', '/rest/api/3/issue', issueData);
      const result = await response.json() as { id: string; key: string; self: string };

      // Get the full issue details
      const issue = await this.getIssue(result.key);
      if (!issue) {
        throw new Error('Failed to retrieve created issue');
      }

      return issue;
    } catch (error) {
      throw new Error(`Failed to create Jira issue: ${error}`);
    }
  }

  async getIssue(id: string): Promise<Issue | null> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const expand = 'transitions,operations,changelog,renderedFields';
      const response = await this.request('GET', `/rest/api/3/issue/${id}?expand=${expand}`);
      
      if (response.status === 404) {
        return null;
      }

      const jiraIssue = await response.json() as JiraIssue;
      return this.mapJiraIssueToIssue(jiraIssue);
    } catch (error) {
      throw new Error(`Failed to get Jira issue: ${error}`);
    }
  }

  async updateIssue(id: string, request: UpdateIssueRequest): Promise<Issue> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const fields: any = {};

      if (request.title) fields.summary = request.title;
      if (request.description) fields.description = this.formatDescription(request.description);
      if (request.priority) fields.priority = { name: this.mapPriorityToJira(request.priority) };
      if (request.assignee) fields.assignee = { accountId: request.assignee };
      if (request.labels) fields.labels = request.labels;
      if (request.parent) fields.parent = { key: request.parent };
      if (request.epic) fields.customfield_10014 = request.epic;
      if (request.storyPoints !== undefined) fields.customfield_10016 = request.storyPoints;

      // Add custom fields
      if (request.customFields) {
        Object.assign(fields, request.customFields);
      }

      if (Object.keys(fields).length > 0) {
        await this.request('PUT', `/rest/api/3/issue/${id}`, { fields });
      }

      // Handle status transition separately
      if (request.status) {
        const transitions = await this.getAvailableTransitions(id);
        const targetTransition = transitions.find(t => 
          t.to.name.toLowerCase() === request.status!.toLowerCase()
        );

        if (targetTransition) {
          await this.transitionIssue(id, targetTransition.id);
        }
      }

      const updatedIssue = await this.getIssue(id);
      if (!updatedIssue) {
        throw new Error('Failed to retrieve updated issue');
      }

      return updatedIssue;
    } catch (error) {
      throw new Error(`Failed to update Jira issue: ${error}`);
    }
  }

  async deleteIssue(id: string): Promise<void> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      await this.request('DELETE', `/rest/api/3/issue/${id}`);
    } catch (error) {
      throw new Error(`Failed to delete Jira issue: ${error}`);
    }
  }

  async listIssues(query?: IssueQuery): Promise<Issue[]> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const jql = this.buildJQL(query);
      const params = new URLSearchParams({
        jql,
        maxResults: (query?.limit || 50).toString(),
        startAt: (query?.offset || 0).toString(),
      });

      if (query?.sortBy) {
        params.set('fields', '*all');
        params.set('expand', 'transitions,operations,changelog');
      }

      const response = await this.request('GET', `/rest/api/3/search?${params.toString()}`);
      const data = await response.json() as { issues: JiraIssue[] };

      return data.issues.map(issue => this.mapJiraIssueToIssue(issue));
    } catch (error) {
      throw new Error(`Failed to list Jira issues: ${error}`);
    }
  }

  // ========================================================================
  // BOARD OPERATIONS
  // ========================================================================

  async getBoard(id: string): Promise<Board | null> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const response = await this.request('GET', `/rest/agile/1.0/board/${id}`);
      
      if (response.status === 404) {
        return null;
      }

      const jiraBoard = await response.json() as JiraBoard;
      return this.mapJiraBoardToBoard(jiraBoard);
    } catch (error) {
      throw new Error(`Failed to get Jira board: ${error}`);
    }
  }

  async listBoards(projectId?: string): Promise<Board[]> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      let url = '/rest/agile/1.0/board';
      if (projectId) {
        url += `?projectKeyOrId=${projectId}`;
      }

      const response = await this.request('GET', url);
      const data = await response.json() as { values: JiraBoard[] };

      return data.values.map(board => this.mapJiraBoardToBoard(board));
    } catch (error) {
      throw new Error(`Failed to list Jira boards: ${error}`);
    }
  }

  async createBoard(request: CreateBoardRequest): Promise<Board> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const boardData = {
        name: request.name,
        type: request.type === 'scrum' ? 'scrum' : 'kanban',
        filterId: await this.createBoardFilter(request),
      };

      const response = await this.request('POST', '/rest/agile/1.0/board', boardData);
      const jiraBoard = await response.json() as JiraBoard;

      return this.mapJiraBoardToBoard(jiraBoard);
    } catch (error) {
      throw new Error(`Failed to create Jira board: ${error}`);
    }
  }

  // ========================================================================
  // BULK OPERATIONS
  // ========================================================================

  async bulkUpdateIssues(operation: BulkOperation<UpdateIssueRequest>): Promise<Issue[]> {
    if (!this.config) throw new Error('Not connected to Jira');

    const results: Issue[] = [];
    const batchSize = 50; // Jira bulk operation limit

    for (let i = 0; i < operation.targets.length; i += batchSize) {
      const batch = operation.targets.slice(i, i + batchSize);
      const updates = batch.map(issueId => ({
        issueIdOrKey: issueId,
        fields: this.buildUpdateFields(operation.data || {}),
      }));

      try {
        await this.request('POST', '/rest/api/3/issue/bulk', {
          issueUpdates: updates,
        });

        // Fetch updated issues
        for (const issueId of batch) {
          try {
            const issue = await this.getIssue(issueId);
            if (issue) results.push(issue);
          } catch {
            // Continue with other issues if one fails
          }
        }
      } catch (error) {
        console.warn(`Failed to bulk update batch:`, error);
      }
    }

    return results;
  }

  async bulkDeleteIssues(issueIds: string[]): Promise<void> {
    if (!this.config) throw new Error('Not connected to Jira');

    const batchSize = 50;

    for (let i = 0; i < issueIds.length; i += batchSize) {
      const batch = issueIds.slice(i, i + batchSize);
      
      try {
        await this.request('POST', '/rest/api/3/issue/bulk', {
          issueUpdates: batch.map(issueId => ({
            issueIdOrKey: issueId,
            update: {},
            historyMetadata: {
              type: 'myplugin:type',
              description: 'text description',
              descriptionKey: 'plugin.changereason.i18.key',
              activityDescription: 'text description',
              activityDescriptionKey: 'plugin.activity.i18.key',
              actor: { id: 'tony', displayName: 'Tony', type: 'mysystem-user', avatarUrl: 'http://mysystem/avatar/tony.jpg' }
            }
          }))
        });
      } catch (error) {
        console.warn(`Failed to bulk delete batch:`, error);
      }
    }
  }

  // ========================================================================
  // SEARCH OPERATIONS
  // ========================================================================

  async searchIssues(query: string, filters?: Record<string, any>): Promise<Issue[]> {
    const issueQuery: IssueQuery = {
      search: query,
      ...filters,
    };

    return this.listIssues(issueQuery);
  }

  async searchProjects(query: string, filters?: Record<string, any>): Promise<Project[]> {
    const projectQuery: ProjectQuery = {
      search: query,
      ...filters,
    };

    return this.listProjects(projectQuery);
  }

  // ========================================================================
  // WORKFLOW OPERATIONS
  // ========================================================================

  async getWorkflows(projectId?: string): Promise<Workflow[]> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const url = projectId 
        ? `/rest/api/3/project/${projectId}/statuses`
        : '/rest/api/3/status';
      
      const response = await this.request('GET', url);
      const data = await response.json() as JiraStatus[] | { issueTypes: any[] };

      // This is a simplified implementation
      // Full workflow support would require additional API calls
      const statuses = Array.isArray(data) ? data : [];

      return [{
        id: 'default-workflow',
        name: 'Default Workflow',
        description: 'Default Jira workflow',
        statuses: statuses.map(status => ({
          id: status.id,
          name: status.name,
          category: this.mapJiraStatusCategory(status.statusCategory.key),
          description: status.statusCategory.name,
          properties: {},
        })),
        transitions: [], // Would need separate API call to get transitions
        rules: [],
        platform: 'jira',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }];
    } catch (error) {
      throw new Error(`Failed to get Jira workflows: ${error}`);
    }
  }

  async transitionIssue(issueId: string, transitionId: string, data?: any): Promise<Issue> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const transitionData = {
        transition: { id: transitionId },
        fields: data?.fields || {},
        update: data?.update || {},
      };

      await this.request('POST', `/rest/api/3/issue/${issueId}/transitions`, transitionData);

      const updatedIssue = await this.getIssue(issueId);
      if (!updatedIssue) {
        throw new Error('Failed to retrieve transitioned issue');
      }

      return updatedIssue;
    } catch (error) {
      throw new Error(`Failed to transition Jira issue: ${error}`);
    }
  }

  // ========================================================================
  // COMMENT OPERATIONS
  // ========================================================================

  async addComment(issueId: string, body: string, visibility?: CommentVisibility): Promise<Comment> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const commentData: any = {
        body: this.formatDescription(body),
      };

      if (visibility && visibility.type !== 'public') {
        commentData.visibility = {
          type: visibility.type === 'internal' ? 'group' : 'role',
          value: visibility.restrictedTo?.[0] || 'Developers',
        };
      }

      const response = await this.request('POST', `/rest/api/3/issue/${issueId}/comment`, commentData);
      const result = await response.json() as {
        id: string;
        author: { displayName: string };
        body: { content: any[] };
        created: string;
        updated: string;
      };

      return {
        id: result.id,
        author: result.author.displayName,
        body: this.extractTextFromContent(result.body.content),
        visibility,
        createdAt: new Date(result.created),
        updatedAt: new Date(result.updated),
      };
    } catch (error) {
      throw new Error(`Failed to add comment to Jira issue: ${error}`);
    }
  }

  async updateComment(commentId: string, body: string): Promise<Comment> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const commentData = {
        body: this.formatDescription(body),
      };

      const response = await this.request('PUT', `/rest/api/3/comment/${commentId}`, commentData);
      const result = await response.json() as {
        id: string;
        author: { displayName: string };
        body: { content: any[] };
        created: string;
        updated: string;
      };

      return {
        id: result.id,
        author: result.author.displayName,
        body: this.extractTextFromContent(result.body.content),
        createdAt: new Date(result.created),
        updatedAt: new Date(result.updated),
      };
    } catch (error) {
      throw new Error(`Failed to update Jira comment: ${error}`);
    }
  }

  async deleteComment(commentId: string): Promise<void> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      await this.request('DELETE', `/rest/api/3/comment/${commentId}`);
    } catch (error) {
      throw new Error(`Failed to delete Jira comment: ${error}`);
    }
  }

  // ========================================================================
  // WEBHOOK OPERATIONS
  // ========================================================================

  async registerWebhook(config: WebhookConfig): Promise<string> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const webhookData = {
        name: `Claude Flow Webhook ${Date.now()}`,
        url: config.url,
        events: this.mapEventTypesToJiraEvents(config.events),
        filters: this.buildWebhookFilters(config.filters || []),
        excludeBody: false,
      };

      const response = await this.request('POST', '/rest/webhooks/1.0/webhook', webhookData);
      const result = await response.json() as { self: string };

      // Extract webhook ID from self URL
      const webhookId = result.self.split('/').pop() || '';
      return webhookId;
    } catch (error) {
      throw new Error(`Failed to register Jira webhook: ${error}`);
    }
  }

  async unregisterWebhook(id: string): Promise<void> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      await this.request('DELETE', `/rest/webhooks/1.0/webhook/${id}`);
    } catch (error) {
      throw new Error(`Failed to unregister Jira webhook: ${error}`);
    }
  }

  // ========================================================================
  // ATTACHMENT OPERATIONS
  // ========================================================================

  async addAttachment(issueId: string, file: File | Buffer, filename: string): Promise<Attachment> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const formData = new FormData();
      if (file instanceof Buffer) {
        formData.append('file', new Blob([file]), filename);
      } else {
        formData.append('file', file, filename);
      }

      const headers = { ...this.baseHeaders };
      delete headers['Content-Type']; // Let browser set multipart boundary

      const response = await fetch(`${this.config.baseUrl}/rest/api/3/issue/${issueId}/attachments`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as {
        id: string;
        filename: string;
        size: number;
        mimeType: string;
        content: string;
        author: { displayName: string };
        created: string;
      }[];

      const attachment = result[0];

      return {
        id: attachment.id,
        filename: attachment.filename,
        size: attachment.size,
        mimeType: attachment.mimeType,
        url: attachment.content,
        uploadedBy: attachment.author.displayName,
        uploadedAt: new Date(attachment.created),
      };
    } catch (error) {
      throw new Error(`Failed to add attachment to Jira issue: ${error}`);
    }
  }

  async getAttachment(id: string): Promise<Buffer> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      const response = await fetch(`${this.config.baseUrl}/rest/api/3/attachment/content/${id}`, {
        headers: this.baseHeaders,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      throw new Error(`Failed to get Jira attachment: ${error}`);
    }
  }

  async deleteAttachment(id: string): Promise<void> {
    if (!this.config) throw new Error('Not connected to Jira');

    try {
      await this.request('DELETE', `/rest/api/3/attachment/${id}`);
    } catch (error) {
      throw new Error(`Failed to delete Jira attachment: ${error}`);
    }
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  private async request(method: string, endpoint: string, body?: any): Promise<Response> {
    if (!this.config) throw new Error('Not connected to Jira');

    const url = `${this.config.baseUrl}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: this.baseHeaders,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response;
  }

  private generateProjectKey(title: string): string {
    return title
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 10)
      .padEnd(3, 'X');
  }

  private mapProjectTypeToJira(type: ProjectType): string {
    const mapping: Record<ProjectType, string> = {
      software: 'software',
      business: 'business',
      personal: 'software',
      template: 'software',
      kanban: 'software',
      scrum: 'software',
      custom: 'software',
    };
    return mapping[type] || 'software';
  }

  private mapIssueTypeToJira(type: IssueType): string {
    const mapping: Record<IssueType, string> = {
      task: 'Task',
      bug: 'Bug',
      feature: 'Story',
      epic: 'Epic',
      story: 'Story',
      subtask: 'Subtask',
      improvement: 'Improvement',
      research: 'Task',
      spike: 'Story',
      test: 'Task',
      documentation: 'Task',
    };
    return mapping[type] || 'Task';
  }

  private mapPriorityToJira(priority: Priority): string {
    const mapping: Record<Priority, string> = {
      lowest: 'Lowest',
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      highest: 'Highest',
      critical: 'Highest',
    };
    return mapping[priority] || 'Medium';
  }

  private mapJiraStatusCategory(category: string): 'todo' | 'in_progress' | 'done' {
    switch (category) {
      case 'new':
      case 'indeterminate':
        return 'todo';
      case 'done':
        return 'done';
      default:
        return 'in_progress';
    }
  }

  private mapJiraProjectToProject(jiraProject: JiraProject): Project {
    return {
      id: jiraProject.key,
      title: jiraProject.name,
      description: jiraProject.description || '',
      status: 'active',
      priority: 'medium',
      assignee: jiraProject.lead?.accountId,
      labels: [],
      url: jiraProject.url,
      platform: 'jira',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        projectId: jiraProject.id,
        projectTypeKey: jiraProject.projectTypeKey,
        style: jiraProject.style,
        lead: jiraProject.lead,
        insight: jiraProject.insight,
      },
      type: 'software',
      owner: jiraProject.lead?.displayName || '',
      members: [],
      boards: [],
      workflows: [],
      settings: {
        issueTypes: [],
        customFields: [],
        notifications: {
          email: { enabled: false, events: [], recipients: [] },
          webhook: { enabled: false, events: [], urls: [] },
          inApp: { enabled: false, events: [] },
        },
        automation: { rules: [], templates: [] },
        integrations: [],
      },
      visibility: 'private',
    };
  }

  private mapJiraIssueToIssue(jiraIssue: JiraIssue): Issue {
    return {
      id: jiraIssue.key,
      title: jiraIssue.fields.summary,
      description: this.extractTextFromDescription(jiraIssue.fields.description),
      status: jiraIssue.fields.status.name.toLowerCase().replace(/\s+/g, '_') as ProjectStatus,
      priority: this.mapJiraPriorityToPriority(jiraIssue.fields.priority.name),
      assignee: jiraIssue.fields.assignee?.accountId,
      labels: jiraIssue.fields.labels,
      url: jiraIssue.self.replace('/rest/api/3/issue/', '/browse/'),
      platform: 'jira',
      createdAt: new Date(jiraIssue.fields.created),
      updatedAt: new Date(jiraIssue.fields.updated),
      metadata: {
        id: jiraIssue.id,
        self: jiraIssue.self,
        status: jiraIssue.fields.status,
        priority: jiraIssue.fields.priority,
        issuetype: jiraIssue.fields.issuetype,
      },
      project: jiraIssue.fields.project.key,
      type: this.mapJiraIssueTypeToIssueType(jiraIssue.fields.issuetype.name),
      reporter: jiraIssue.fields.reporter.accountId,
      comments: [],
      attachments: [],
      parent: jiraIssue.fields.parent?.key,
      children: jiraIssue.fields.subtasks.map(st => st.key),
      timeTracking: jiraIssue.fields.timetracking ? {
        originalEstimate: jiraIssue.fields.timetracking.originalEstimateSeconds,
        remainingEstimate: jiraIssue.fields.timetracking.remainingEstimateSeconds,
        timeSpent: jiraIssue.fields.timetracking.timeSpentSeconds,
        worklog: (jiraIssue.fields.worklog?.worklogs || []).map(wl => ({
          id: wl.id,
          author: wl.author.displayName,
          timeSpent: wl.timeSpentSeconds,
          comment: this.extractTextFromContent(wl.comment?.content || []),
          startedAt: new Date(wl.started),
          createdAt: new Date(wl.created),
        })),
      } : undefined,
      customFields: {},
    };
  }

  private mapJiraBoardToBoard(jiraBoard: JiraBoard): Board {
    return {
      id: jiraBoard.id.toString(),
      title: jiraBoard.name,
      description: `${jiraBoard.type} board for ${jiraBoard.location.projectName}`,
      status: 'active',
      priority: 'medium',
      assignee: undefined,
      labels: [],
      url: jiraBoard.self,
      platform: 'jira',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        type: jiraBoard.type,
        location: jiraBoard.location,
      },
      project: jiraBoard.location.projectKey,
      type: jiraBoard.type.toLowerCase() as BoardType,
      columns: [], // Would need separate API call to get columns
      permissions: {
        view: [],
        edit: [],
        admin: [],
      },
    };
  }

  private buildJQL(query?: IssueQuery): string {
    const conditions: string[] = [];

    if (query?.projects && query.projects.length > 0) {
      conditions.push(`project in (${query.projects.map(p => `"${p}"`).join(', ')})`);
    }

    if (query?.statuses && query.statuses.length > 0) {
      conditions.push(`status in (${query.statuses.map(s => `"${s}"`).join(', ')})`);
    }

    if (query?.types && query.types.length > 0) {
      const jiraTypes = query.types.map(t => this.mapIssueTypeToJira(t));
      conditions.push(`issuetype in (${jiraTypes.map(t => `"${t}"`).join(', ')})`);
    }

    if (query?.assignees && query.assignees.length > 0) {
      conditions.push(`assignee in (${query.assignees.map(a => `"${a}"`).join(', ')})`);
    }

    if (query?.reporters && query.reporters.length > 0) {
      conditions.push(`reporter in (${query.reporters.map(r => `"${r}"`).join(', ')})`);
    }

    if (query?.labels && query.labels.length > 0) {
      conditions.push(`labels in (${query.labels.map(l => `"${l}"`).join(', ')})`);
    }

    if (query?.search) {
      conditions.push(`text ~ "${query.search}"`);
    }

    if (query?.created) {
      if (query.created.start) {
        conditions.push(`created >= "${query.created.start.toISOString().split('T')[0]}"`);
      }
      if (query.created.end) {
        conditions.push(`created <= "${query.created.end.toISOString().split('T')[0]}"`);
      }
    }

    let jql = conditions.length > 0 ? conditions.join(' AND ') : 'project is not EMPTY';

    // Add sorting
    if (query?.sortBy) {
      const sortField = query.sortBy === 'created' ? 'created' : 
                       query.sortBy === 'updated' ? 'updated' :
                       query.sortBy === 'priority' ? 'priority' :
                       'key';
      const sortOrder = query.sortOrder || 'desc';
      jql += ` ORDER BY ${sortField} ${sortOrder.toUpperCase()}`;
    }

    return jql;
  }

  private buildUpdateFields(request: UpdateIssueRequest): any {
    const fields: any = {};

    if (request.title) fields.summary = request.title;
    if (request.description) fields.description = this.formatDescription(request.description);
    if (request.priority) fields.priority = { name: this.mapPriorityToJira(request.priority) };
    if (request.assignee) fields.assignee = { accountId: request.assignee };
    if (request.labels) fields.labels = request.labels;

    return fields;
  }

  private async getAvailableTransitions(issueId: string): Promise<JiraTransition[]> {
    const response = await this.request('GET', `/rest/api/3/issue/${issueId}/transitions`);
    const data = await response.json() as { transitions: JiraTransition[] };
    return data.transitions;
  }

  private async getCurrentUserAccountId(): Promise<string> {
    const response = await this.request('GET', '/rest/api/3/myself');
    const user = await response.json() as { accountId: string };
    return user.accountId;
  }

  private formatDescription(text: string): any {
    return {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text,
            },
          ],
        },
      ],
    };
  }

  private extractTextFromDescription(description: any): string {
    if (!description || !description.content) return '';
    
    return this.extractTextFromContent(description.content);
  }

  private extractTextFromContent(content: any[]): string {
    if (!Array.isArray(content)) return '';

    return content
      .map(item => {
        if (item.type === 'text') {
          return item.text || '';
        } else if (item.content) {
          return this.extractTextFromContent(item.content);
        }
        return '';
      })
      .join('')
      .trim();
  }

  private mapJiraPriorityToPriority(jiraPriority: string): Priority {
    const mapping: Record<string, Priority> = {
      'Lowest': 'lowest',
      'Low': 'low',
      'Medium': 'medium',
      'High': 'high',
      'Highest': 'highest',
      'Critical': 'critical',
    };
    return mapping[jiraPriority] || 'medium';
  }

  private mapJiraIssueTypeToIssueType(jiraType: string): IssueType {
    const mapping: Record<string, IssueType> = {
      'Task': 'task',
      'Bug': 'bug',
      'Story': 'story',
      'Epic': 'epic',
      'Subtask': 'subtask',
      'Sub-task': 'subtask',
      'Improvement': 'improvement',
    };
    return mapping[jiraType] || 'task';
  }

  private async createBoardFilter(request: CreateBoardRequest): Promise<number> {
    // This would create a JQL filter for the board
    // For simplicity, returning a default filter ID
    return 10000;
  }

  private mapEventTypesToJiraEvents(events: import('../core/interfaces.js').EventType[]): string[] {
    const mapping: Record<string, string> = {
      'project.created': 'project_created',
      'project.updated': 'project_updated',
      'project.deleted': 'project_deleted',
      'issue.created': 'jira:issue_created',
      'issue.updated': 'jira:issue_updated',
      'issue.deleted': 'jira:issue_deleted',
      'issue.transitioned': 'jira:issue_updated',
      'comment.created': 'comment_created',
      'comment.updated': 'comment_updated',
      'comment.deleted': 'comment_deleted',
      'attachment.added': 'attachment_created',
      'attachment.removed': 'attachment_deleted',
    };

    return events.map(event => mapping[event]).filter(Boolean);
  }

  private buildWebhookFilters(filters: import('../core/interfaces.js').EventFilter[]): any {
    // Build Jira-specific webhook filters
    return {};
  }
}