/**
 * GitHub Projects Adapter
 * 
 * Implements the PlatformAdapter interface for GitHub Projects v2
 * Provides unified interface for GitHub Issues, Projects, and related operations
 */

import { Octokit } from '@octokit/rest';
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
} from '../core/interfaces.js';

interface GitHubConfig {
  token: string;
  baseUrl?: string;
  owner?: string; // Default repository owner
  repo?: string; // Default repository
}

interface GitHubProjectV2 {
  id: string;
  number: number;
  title: string;
  shortDescription?: string;
  body?: string;
  state: 'OPEN' | 'CLOSED';
  url: string;
  createdAt: string;
  updatedAt: string;
  owner: {
    login: string;
  };
  fields: {
    nodes: GitHubProjectField[];
  };
  items: {
    nodes: GitHubProjectItem[];
  };
}

interface GitHubProjectField {
  id: string;
  name: string;
  dataType: string;
  options?: {
    id: string;
    name: string;
    color?: string;
  }[];
}

interface GitHubProjectItem {
  id: string;
  content?: {
    id: string;
    number?: number;
    title: string;
    body?: string;
    state: string;
    url: string;
    assignees: {
      nodes: { login: string; url: string }[];
    };
    labels: {
      nodes: { name: string; color: string }[];
    };
    createdAt: string;
    updatedAt: string;
  };
  fieldValues: {
    nodes: {
      field: { name: string };
      value?: string;
    }[];
  };
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  html_url: string;
  user: {
    login: string;
  };
  assignees: {
    login: string;
  }[];
  labels: {
    name: string;
    color: string;
  }[];
  milestone?: {
    title: string;
    number: number;
  };
  created_at: string;
  updated_at: string;
}

export class GitHubAdapter implements PlatformAdapter {
  readonly platform = 'github' as const;
  readonly name = 'GitHub Projects';
  readonly version = '2.0.0';
  readonly capabilities: PlatformCapabilities;

  private octokit?: Octokit;
  private config?: GitHubConfig;
  private isConnected = false;

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
        delete: false, // GitHub doesn't allow deleting issues
        list: true,
        search: true,
        bulk: true,
        hierarchy: false, // Limited parent/child support
        links: true,
        timeTracking: false, // Not native to GitHub
        customFields: true, // Via project fields
      },
      boards: {
        read: true,
        create: true,
        update: true,
        delete: true,
        customColumns: true,
        swimlanes: false, // Not supported in GitHub Projects
        filters: true,
      },
      workflows: {
        read: true,
        create: false, // Workflows are predefined
        update: false,
        transition: true, // Via issue state changes
        customStatuses: false,
        conditions: false,
        validators: false,
      },
      attachments: {
        upload: false, // Not directly supported via API
        download: false,
        delete: false,
        maxSize: 0,
        allowedTypes: [],
      },
      comments: {
        create: true,
        update: true,
        delete: true,
        visibility: false, // No visibility control in GitHub
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
          'comment.created',
          'comment.updated',
          'comment.deleted',
        ],
        customEvents: false,
      },
      search: {
        projects: true,
        issues: true,
        customQuery: true,
        savedQueries: false,
      },
      authentication: {
        types: ['token', 'oauth', 'app'],
        scopes: ['repo', 'project'],
        refreshSupported: true,
      },
    };
  }

  // ========================================================================
  // CONNECTION MANAGEMENT
  // ========================================================================

  async connect(authConfig: AuthConfig): Promise<void> {
    if (authConfig.platform !== 'github') {
      throw new Error('Invalid platform configuration for GitHub adapter');
    }

    const token = authConfig.credentials.token;
    if (!token) {
      throw new Error('GitHub token is required');
    }

    this.config = {
      token,
      baseUrl: authConfig.baseUrl || 'https://api.github.com',
      owner: authConfig.credentials.customFields?.owner as string,
      repo: authConfig.credentials.customFields?.repo as string,
    };

    this.octokit = new Octokit({
      auth: token,
      baseUrl: this.config.baseUrl,
      userAgent: 'Claude Flow GitHub Adapter v2.0.0',
    });

    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    this.octokit = undefined;
    this.config = undefined;
    this.isConnected = false;
  }

  isConnected(): boolean {
    return this.isConnected;
  }

  async testConnection(): Promise<boolean> {
    if (!this.octokit) return false;

    try {
      await this.octokit.users.getAuthenticated();
      return true;
    } catch {
      return false;
    }
  }

  // ========================================================================
  // PROJECT OPERATIONS
  // ========================================================================

  async createProject(request: CreateProjectRequest): Promise<Project> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    const owner = this.config?.owner || 'user'; // Will be replaced with authenticated user
    
    try {
      // Create GitHub Project v2
      const mutation = `
        mutation CreateProject($ownerId: ID!, $title: String!, $body: String!) {
          createProjectV2(input: {
            ownerId: $ownerId
            title: $title
            body: $body
          }) {
            projectV2 {
              id
              number
              title
              shortDescription
              body
              state
              url
              createdAt
              updatedAt
              owner {
                login
              }
            }
          }
        }
      `;

      // Get owner ID first
      const user = await this.octokit.users.getAuthenticated();
      const ownerId = user.data.node_id;

      const result = await this.octokit.graphql<{
        createProjectV2: { projectV2: GitHubProjectV2 };
      }>(mutation, {
        ownerId,
        title: request.title,
        body: request.description,
      });

      const githubProject = result.createProjectV2.projectV2;

      return this.mapGitHubProjectToProject(githubProject);
    } catch (error) {
      throw new Error(`Failed to create GitHub project: ${error}`);
    }
  }

  async getProject(id: string): Promise<Project | null> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    try {
      const query = `
        query GetProject($id: ID!) {
          node(id: $id) {
            ... on ProjectV2 {
              id
              number
              title
              shortDescription
              body
              state
              url
              createdAt
              updatedAt
              owner {
                login
              }
              fields(first: 100) {
                nodes {
                  id
                  name
                  dataType
                  ... on ProjectV2SingleSelectField {
                    options {
                      id
                      name
                      color
                    }
                  }
                }
              }
              items(first: 100) {
                nodes {
                  id
                  content {
                    ... on Issue {
                      id
                      number
                      title
                      body
                      state
                      url
                      assignees(first: 10) {
                        nodes {
                          login
                          url
                        }
                      }
                      labels(first: 10) {
                        nodes {
                          name
                          color
                        }
                      }
                      createdAt
                      updatedAt
                    }
                  }
                  fieldValues(first: 20) {
                    nodes {
                      field {
                        name
                      }
                      ... on ProjectV2ItemFieldTextValue {
                        value: text
                      }
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        value: name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const result = await this.octokit.graphql<{
        node: GitHubProjectV2 | null;
      }>(query, { id });

      if (!result.node) {
        return null;
      }

      return this.mapGitHubProjectToProject(result.node);
    } catch (error) {
      throw new Error(`Failed to get GitHub project: ${error}`);
    }
  }

  async updateProject(id: string, request: UpdateProjectRequest): Promise<Project> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    try {
      const mutation = `
        mutation UpdateProject($id: ID!, $title: String, $body: String) {
          updateProjectV2(input: {
            projectId: $id
            title: $title
            body: $body
          }) {
            projectV2 {
              id
              number
              title
              shortDescription
              body
              state
              url
              createdAt
              updatedAt
              owner {
                login
              }
            }
          }
        }
      `;

      const result = await this.octokit.graphql<{
        updateProjectV2: { projectV2: GitHubProjectV2 };
      }>(mutation, {
        id,
        title: request.title,
        body: request.description,
      });

      return this.mapGitHubProjectToProject(result.updateProjectV2.projectV2);
    } catch (error) {
      throw new Error(`Failed to update GitHub project: ${error}`);
    }
  }

  async deleteProject(id: string): Promise<void> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    try {
      const mutation = `
        mutation DeleteProject($id: ID!) {
          deleteProjectV2(input: { projectId: $id }) {
            projectV2 {
              id
            }
          }
        }
      `;

      await this.octokit.graphql(mutation, { id });
    } catch (error) {
      throw new Error(`Failed to delete GitHub project: ${error}`);
    }
  }

  async listProjects(query?: ProjectQuery): Promise<Project[]> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    try {
      const graphqlQuery = `
        query ListProjects($first: Int!, $after: String) {
          viewer {
            projectsV2(first: $first, after: $after) {
              nodes {
                id
                number
                title
                shortDescription
                body
                state
                url
                createdAt
                updatedAt
                owner {
                  login
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `;

      const limit = query?.limit || 50;
      let projects: GitHubProjectV2[] = [];
      let hasNextPage = true;
      let cursor: string | undefined;

      while (hasNextPage && projects.length < limit) {
        const result = await this.octokit.graphql<{
          viewer: {
            projectsV2: {
              nodes: GitHubProjectV2[];
              pageInfo: { hasNextPage: boolean; endCursor: string };
            };
          };
        }>(graphqlQuery, {
          first: Math.min(limit - projects.length, 50),
          after: cursor,
        });

        projects.push(...result.viewer.projectsV2.nodes);
        hasNextPage = result.viewer.projectsV2.pageInfo.hasNextPage;
        cursor = result.viewer.projectsV2.pageInfo.endCursor;
      }

      // Apply filters
      let filteredProjects = projects;

      if (query?.statuses && query.statuses.length > 0) {
        filteredProjects = filteredProjects.filter(p =>
          query.statuses!.some(status => this.mapGitHubProjectState(p.state) === status)
        );
      }

      if (query?.search) {
        const searchTerm = query.search.toLowerCase();
        filteredProjects = filteredProjects.filter(p =>
          p.title.toLowerCase().includes(searchTerm) ||
          (p.body && p.body.toLowerCase().includes(searchTerm))
        );
      }

      // Apply sorting
      if (query?.sortBy) {
        filteredProjects.sort((a, b) => {
          let aValue: any, bValue: any;
          switch (query.sortBy) {
            case 'name':
              aValue = a.title;
              bValue = b.title;
              break;
            case 'created':
              aValue = new Date(a.createdAt);
              bValue = new Date(b.createdAt);
              break;
            case 'updated':
              aValue = new Date(a.updatedAt);
              bValue = new Date(b.updatedAt);
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

      return filteredProjects.map(p => this.mapGitHubProjectToProject(p));
    } catch (error) {
      throw new Error(`Failed to list GitHub projects: ${error}`);
    }
  }

  // ========================================================================
  // ISSUE OPERATIONS
  // ========================================================================

  async createIssue(request: CreateIssueRequest): Promise<Issue> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    const [owner, repo] = this.parseProjectId(request.project);

    try {
      const result = await this.octokit.issues.create({
        owner,
        repo,
        title: request.title,
        body: request.description,
        assignees: request.assignee ? [request.assignee] : undefined,
        labels: request.labels,
      });

      return this.mapGitHubIssueToIssue(result.data as GitHubIssue, `${owner}/${repo}`);
    } catch (error) {
      throw new Error(`Failed to create GitHub issue: ${error}`);
    }
  }

  async getIssue(id: string): Promise<Issue | null> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    const [owner, repo, issueNumber] = this.parseIssueId(id);

    try {
      const result = await this.octokit.issues.get({
        owner,
        repo,
        issue_number: parseInt(issueNumber),
      });

      return this.mapGitHubIssueToIssue(result.data as GitHubIssue, `${owner}/${repo}`);
    } catch (error) {
      if ((error as any).status === 404) {
        return null;
      }
      throw new Error(`Failed to get GitHub issue: ${error}`);
    }
  }

  async updateIssue(id: string, request: UpdateIssueRequest): Promise<Issue> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    const [owner, repo, issueNumber] = this.parseIssueId(id);

    try {
      const updateData: any = {};
      if (request.title) updateData.title = request.title;
      if (request.description) updateData.body = request.description;
      if (request.status) updateData.state = this.mapProjectStatusToGitHubState(request.status);
      if (request.assignee) updateData.assignees = [request.assignee];
      if (request.labels) updateData.labels = request.labels;

      const result = await this.octokit.issues.update({
        owner,
        repo,
        issue_number: parseInt(issueNumber),
        ...updateData,
      });

      return this.mapGitHubIssueToIssue(result.data as GitHubIssue, `${owner}/${repo}`);
    } catch (error) {
      throw new Error(`Failed to update GitHub issue: ${error}`);
    }
  }

  async deleteIssue(id: string): Promise<void> {
    // GitHub doesn't support deleting issues
    throw new Error('GitHub does not support deleting issues');
  }

  async listIssues(query?: IssueQuery): Promise<Issue[]> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    try {
      let searchQuery = '';
      const filters: string[] = [];

      // Build search query
      if (query?.projects && query.projects.length > 0) {
        const repoFilters = query.projects.map(p => `repo:${p}`);
        filters.push(`(${repoFilters.join(' OR ')})`);
      }

      if (query?.statuses && query.statuses.length > 0) {
        const stateFilters = query.statuses.map(s => `state:${this.mapProjectStatusToGitHubState(s)}`);
        filters.push(`(${stateFilters.join(' OR ')})`);
      }

      if (query?.assignees && query.assignees.length > 0) {
        const assigneeFilters = query.assignees.map(a => `assignee:${a}`);
        filters.push(`(${assigneeFilters.join(' OR ')})`);
      }

      if (query?.labels && query.labels.length > 0) {
        const labelFilters = query.labels.map(l => `label:"${l}"`);
        filters.push(labelFilters.join(' '));
      }

      if (query?.search) {
        filters.push(query.search);
      }

      // Default to issues if no type specified
      filters.push('is:issue');

      searchQuery = filters.join(' ');

      const result = await this.octokit.search.issuesAndPullRequests({
        q: searchQuery,
        sort: query?.sortBy === 'created' ? 'created' : query?.sortBy === 'updated' ? 'updated' : undefined,
        order: query?.sortOrder || 'desc',
        per_page: Math.min(query?.limit || 30, 100),
        page: Math.floor((query?.offset || 0) / 30) + 1,
      });

      return result.data.items.map(item => {
        const [owner, repo] = item.repository_url.split('/').slice(-2);
        return this.mapGitHubIssueToIssue(item as GitHubIssue, `${owner}/${repo}`);
      });
    } catch (error) {
      throw new Error(`Failed to list GitHub issues: ${error}`);
    }
  }

  // ========================================================================
  // BOARD OPERATIONS
  // ========================================================================

  async getBoard(id: string): Promise<Board | null> {
    // GitHub Projects v2 are essentially boards
    const project = await this.getProject(id);
    if (!project) return null;

    return this.mapProjectToBoard(project);
  }

  async listBoards(projectId?: string): Promise<Board[]> {
    if (projectId) {
      const board = await this.getBoard(projectId);
      return board ? [board] : [];
    }

    // List all projects as boards
    const projects = await this.listProjects();
    return projects.map(p => this.mapProjectToBoard(p));
  }

  // ========================================================================
  // BULK OPERATIONS
  // ========================================================================

  async bulkUpdateIssues(operation: BulkOperation<UpdateIssueRequest>): Promise<Issue[]> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    const results: Issue[] = [];
    
    for (const issueId of operation.targets) {
      try {
        const updatedIssue = await this.updateIssue(issueId, operation.data || {});
        results.push(updatedIssue);
      } catch (error) {
        // Continue with other issues even if one fails
        console.warn(`Failed to update issue ${issueId}:`, error);
      }
    }

    return results;
  }

  async bulkDeleteIssues(issueIds: string[]): Promise<void> {
    // GitHub doesn't support deleting issues
    throw new Error('GitHub does not support deleting issues');
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
    // GitHub has simple open/closed workflows
    return [
      {
        id: 'github-issue-workflow',
        name: 'GitHub Issue Workflow',
        description: 'Standard GitHub issue workflow with open and closed states',
        statuses: [
          {
            id: 'open',
            name: 'Open',
            category: 'todo',
            description: 'Issue is open and needs attention',
            properties: {},
          },
          {
            id: 'closed',
            name: 'Closed',
            category: 'done',
            description: 'Issue has been resolved',
            properties: {},
          },
        ],
        transitions: [
          {
            id: 'open-to-closed',
            name: 'Close Issue',
            from: 'open',
            to: 'closed',
            conditions: [],
            validators: [],
            postFunctions: [],
          },
          {
            id: 'closed-to-open',
            name: 'Reopen Issue',
            from: 'closed',
            to: 'open',
            conditions: [],
            validators: [],
            postFunctions: [],
          },
        ],
        rules: [],
        platform: 'github',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }

  async transitionIssue(issueId: string, transitionId: string, data?: any): Promise<Issue> {
    const [owner, repo, issueNumber] = this.parseIssueId(issueId);

    const state = transitionId === 'open-to-closed' ? 'closed' : 'open';

    return this.updateIssue(issueId, { status: state === 'closed' ? 'closed' : 'open' });
  }

  // ========================================================================
  // COMMENT OPERATIONS
  // ========================================================================

  async addComment(issueId: string, body: string, visibility?: CommentVisibility): Promise<Comment> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    const [owner, repo, issueNumber] = this.parseIssueId(issueId);

    try {
      const result = await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: parseInt(issueNumber),
        body,
      });

      return {
        id: result.data.id.toString(),
        author: result.data.user?.login || 'unknown',
        body: result.data.body || '',
        createdAt: new Date(result.data.created_at),
        updatedAt: new Date(result.data.updated_at),
      };
    } catch (error) {
      throw new Error(`Failed to add comment to GitHub issue: ${error}`);
    }
  }

  async updateComment(commentId: string, body: string): Promise<Comment> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    try {
      const result = await this.octokit.issues.updateComment({
        owner: this.config?.owner || '',
        repo: this.config?.repo || '',
        comment_id: parseInt(commentId),
        body,
      });

      return {
        id: result.data.id.toString(),
        author: result.data.user?.login || 'unknown',
        body: result.data.body || '',
        createdAt: new Date(result.data.created_at),
        updatedAt: new Date(result.data.updated_at),
      };
    } catch (error) {
      throw new Error(`Failed to update GitHub comment: ${error}`);
    }
  }

  async deleteComment(commentId: string): Promise<void> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    try {
      await this.octokit.issues.deleteComment({
        owner: this.config?.owner || '',
        repo: this.config?.repo || '',
        comment_id: parseInt(commentId),
      });
    } catch (error) {
      throw new Error(`Failed to delete GitHub comment: ${error}`);
    }
  }

  // ========================================================================
  // WEBHOOK OPERATIONS
  // ========================================================================

  async registerWebhook(config: WebhookConfig): Promise<string> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    const owner = this.config?.owner;
    const repo = this.config?.repo;

    if (!owner || !repo) {
      throw new Error('Owner and repository must be configured for webhook registration');
    }

    try {
      const result = await this.octokit.repos.createWebhook({
        owner,
        repo,
        config: {
          url: config.url,
          content_type: 'json',
          secret: config.secret,
        },
        events: this.mapEventTypesToGitHubEvents(config.events),
        active: config.isActive,
      });

      return result.data.id.toString();
    } catch (error) {
      throw new Error(`Failed to register GitHub webhook: ${error}`);
    }
  }

  async unregisterWebhook(id: string): Promise<void> {
    if (!this.octokit) throw new Error('Not connected to GitHub');

    const owner = this.config?.owner;
    const repo = this.config?.repo;

    if (!owner || !repo) {
      throw new Error('Owner and repository must be configured for webhook operations');
    }

    try {
      await this.octokit.repos.deleteWebhook({
        owner,
        repo,
        hook_id: parseInt(id),
      });
    } catch (error) {
      throw new Error(`Failed to unregister GitHub webhook: ${error}`);
    }
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  private mapGitHubProjectToProject(githubProject: GitHubProjectV2): Project {
    return {
      id: githubProject.id,
      title: githubProject.title,
      description: githubProject.body || githubProject.shortDescription || '',
      status: this.mapGitHubProjectState(githubProject.state),
      priority: 'medium',
      assignee: undefined,
      labels: [],
      url: githubProject.url,
      platform: 'github',
      createdAt: new Date(githubProject.createdAt),
      updatedAt: new Date(githubProject.updatedAt),
      metadata: {
        number: githubProject.number,
        owner: githubProject.owner.login,
      },
      type: 'software',
      owner: githubProject.owner.login,
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
      visibility: 'public',
    };
  }

  private mapGitHubIssueToIssue(githubIssue: GitHubIssue, projectId: string): Issue {
    return {
      id: `${projectId}/${githubIssue.number}`,
      title: githubIssue.title,
      description: githubIssue.body || '',
      status: githubIssue.state as ProjectStatus,
      priority: 'medium',
      assignee: githubIssue.assignees[0]?.login,
      labels: githubIssue.labels.map(l => l.name),
      url: githubIssue.html_url,
      platform: 'github',
      createdAt: new Date(githubIssue.created_at),
      updatedAt: new Date(githubIssue.updated_at),
      metadata: {
        number: githubIssue.number,
        user: githubIssue.user.login,
        milestone: githubIssue.milestone,
      },
      project: projectId,
      type: 'task',
      reporter: githubIssue.user.login,
      comments: [],
      attachments: [],
      children: [],
      customFields: {},
    };
  }

  private mapProjectToBoard(project: Project): Board {
    return {
      id: project.id,
      title: `${project.title} Board`,
      description: project.description,
      status: project.status,
      priority: project.priority,
      assignee: project.assignee,
      labels: project.labels,
      url: project.url,
      platform: project.platform,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      metadata: project.metadata,
      project: project.id,
      type: 'kanban',
      columns: [
        {
          id: 'open',
          name: 'Open',
          position: 0,
          status: 'open',
          issueTypes: ['task', 'bug', 'feature'],
        },
        {
          id: 'in_progress',
          name: 'In Progress',
          position: 1,
          status: 'in_progress',
          issueTypes: ['task', 'bug', 'feature'],
        },
        {
          id: 'closed',
          name: 'Closed',
          position: 2,
          status: 'closed',
          issueTypes: ['task', 'bug', 'feature'],
        },
      ],
      permissions: {
        view: [],
        edit: [],
        admin: [],
      },
    };
  }

  private mapGitHubProjectState(state: string): ProjectStatus {
    switch (state) {
      case 'OPEN':
        return 'active';
      case 'CLOSED':
        return 'completed';
      default:
        return 'planning';
    }
  }

  private mapProjectStatusToGitHubState(status: ProjectStatus): string {
    switch (status) {
      case 'closed':
      case 'completed':
      case 'resolved':
        return 'closed';
      case 'open':
      case 'active':
      case 'in_progress':
      case 'todo':
      default:
        return 'open';
    }
  }

  private parseProjectId(projectId: string): [string, string] {
    const parts = projectId.split('/');
    if (parts.length !== 2) {
      throw new Error('Project ID must be in format: owner/repo');
    }
    return [parts[0], parts[1]];
  }

  private parseIssueId(issueId: string): [string, string, string] {
    const parts = issueId.split('/');
    if (parts.length !== 3) {
      throw new Error('Issue ID must be in format: owner/repo/number');
    }
    return [parts[0], parts[1], parts[2]];
  }

  private mapEventTypesToGitHubEvents(events: import('../core/interfaces.js').EventType[]): string[] {
    const mapping: Record<string, string> = {
      'project.created': 'project',
      'project.updated': 'project',
      'project.deleted': 'project',
      'issue.created': 'issues',
      'issue.updated': 'issues',
      'issue.deleted': 'issues',
      'comment.created': 'issue_comment',
      'comment.updated': 'issue_comment',
      'comment.deleted': 'issue_comment',
    };

    const githubEvents = new Set<string>();
    for (const event of events) {
      const githubEvent = mapping[event];
      if (githubEvent) {
        githubEvents.add(githubEvent);
      }
    }

    return Array.from(githubEvents);
  }
}