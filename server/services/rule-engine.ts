import { getDb } from '../db/connection.js';

interface TriggerConfig {
  from_status?: string;
  to_status?: string;
}

interface ActionConfig {
  assignee_id?: string;
  assignee_ids?: string[];
  status?: string;
}

interface WorkflowRule {
  id: string;
  job_definition_id: string;
  name: string;
  trigger_type: string;
  trigger_config: TriggerConfig | null;
  action_type: string;
  action_config: ActionConfig | null;
  is_active: number;
}

interface RuleExecutionResult {
  rule_id: string;
  rule_name: string;
  action_type: string;
  applied: boolean;
  details?: Record<string, any>;
}

/**
 * タスクのステータス変更時にルールを評価・実行する
 */
export async function evaluateStatusChangeRules(
  taskId: string,
  fromStatus: string,
  toStatus: string
): Promise<RuleExecutionResult[]> {
  const db = getDb();
  const results: RuleExecutionResult[] = [];

  // タスクからjob_instance_id、job_definition_idを取得
  const task = db.prepare(`
    SELECT t.*, ji.job_definition_id
    FROM tasks t
    LEFT JOIN job_instances ji ON t.job_instance_id = ji.id
    WHERE t.id = ?
  `).get(taskId) as any;

  if (!task || !task.job_definition_id) {
    // 業務定義に紐づいていないタスクはルール対象外
    return results;
  }

  // 該当する業務定義のアクティブなルールを取得
  const rules = db.prepare(`
    SELECT * FROM workflow_rules
    WHERE job_definition_id = ?
      AND is_active = 1
      AND trigger_type = 'status_changed'
    ORDER BY sort_order ASC
  `).all(task.job_definition_id) as any[];

  for (const rule of rules) {
    const triggerConfig: TriggerConfig = rule.trigger_config
      ? JSON.parse(rule.trigger_config)
      : {};
    const actionConfig: ActionConfig = rule.action_config
      ? JSON.parse(rule.action_config)
      : {};

    // トリガー条件のチェック
    const matchesTrigger = checkStatusChangeTrigger(triggerConfig, fromStatus, toStatus);

    if (!matchesTrigger) {
      continue;
    }

    // アクションの実行
    const result = await executeAction(taskId, rule.action_type, actionConfig);

    results.push({
      rule_id: rule.id,
      rule_name: rule.name,
      action_type: rule.action_type,
      applied: result.success,
      details: result.details,
    });
  }

  return results;
}

/**
 * ステータス変更トリガーの条件をチェック
 */
function checkStatusChangeTrigger(
  config: TriggerConfig,
  fromStatus: string,
  toStatus: string
): boolean {
  // from_statusが指定されていて、一致しない場合はfalse
  if (config.from_status && config.from_status !== fromStatus) {
    return false;
  }

  // to_statusが指定されていて、一致しない場合はfalse
  if (config.to_status && config.to_status !== toStatus) {
    return false;
  }

  // 両方未指定の場合は常にマッチ（任意のステータス変更）
  return true;
}

/**
 * アクションを実行
 */
async function executeAction(
  taskId: string,
  actionType: string,
  config: ActionConfig
): Promise<{ success: boolean; details?: Record<string, any> }> {
  const db = getDb();

  switch (actionType) {
    case 'change_assignee': {
      if (config.assignee_ids && config.assignee_ids.length > 0) {
        // 複数担当者
        db.prepare(`
          UPDATE tasks
          SET assignee_ids = ?, assignee_id = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(JSON.stringify(config.assignee_ids), config.assignee_ids[0], taskId);

        return {
          success: true,
          details: { assignee_ids: config.assignee_ids },
        };
      } else if (config.assignee_id) {
        // 単一担当者
        db.prepare(`
          UPDATE tasks
          SET assignee_id = ?, assignee_ids = NULL, updated_at = datetime('now')
          WHERE id = ?
        `).run(config.assignee_id, taskId);

        return {
          success: true,
          details: { assignee_id: config.assignee_id },
        };
      }
      return { success: false, details: { error: 'No assignee specified' } };
    }

    case 'change_status': {
      if (config.status) {
        db.prepare(`
          UPDATE tasks
          SET status = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(config.status, taskId);

        return {
          success: true,
          details: { status: config.status },
        };
      }
      return { success: false, details: { error: 'No status specified' } };
    }

    default:
      return { success: false, details: { error: `Unknown action type: ${actionType}` } };
  }
}
