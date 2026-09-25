<template>
  <AppLayout>
    <div class="page-title">
      <h1>月度工时统计</h1>
      <el-button type="primary" :icon="Download" :loading="exporting" :disabled="!workhours.list.length" @click="exportCsv">
        导出 Excel
      </el-button>
    </div>
    <div class="panel filters">
      <StoreSelector @change="(value) => (filters.storeId = value as number | undefined)" />
      <el-date-picker v-model="filters.month" type="month" value-format="YYYY-MM" placeholder="选择月份" :clearable="false" />
      <el-button type="primary" :icon="Search" @click="load">查询</el-button>
      <span class="rules">普通班按起止时间计算，跨午夜班次计入次日，休息班不计；单日超过 8 小时部分计为加班。</span>
    </div>
    <div v-loading="workhours.loading">
      <div v-if="workhours.list.length" class="panel">
        <el-table :data="workhours.list" show-summary :summary-method="summaryRow">
          <el-table-column label="员工" min-width="180">
            <template #default="{ row }">
              <EmployeeAvatar :name="row.employeeName" :employee-no="row.employeeNo" size="sm" />
            </template>
          </el-table-column>
          <el-table-column prop="storeName" label="门店" min-width="140" />
          <el-table-column prop="workDays" label="出勤天数" width="100" align="right" />
          <el-table-column prop="totalHours" label="总工时(小时)" width="120" align="right" />
          <el-table-column prop="regularHours" label="正常工时(小时)" width="130" align="right" />
          <el-table-column prop="overtimeHours" label="加班工时(小时)" width="130" align="right">
            <template #default="{ row }">
              <span :class="{ overtime: row.overtimeHours > 0 }">{{ row.overtimeHours }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="exceptionDays" label="异常天数" width="100" align="right">
            <template #default="{ row }">
              <el-tag v-if="row.exceptionDays > 0" type="warning">{{ row.exceptionDays }}</el-tag>
              <span v-else>0</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <EmptyState v-else text="该条件下暂无排班工时数据" />
      <div v-if="workhours.exceptions.length" class="panel exceptions">
        <h2>异常记录</h2>
        <el-alert type="warning" :closable="false" title="以下日期存在重叠班次，当天工时未计入汇总，请先在排班管理中修正后再核算工资。" />
        <el-table :data="workhours.exceptions">
          <el-table-column label="员工" min-width="180">
            <template #default="{ row }">
              <EmployeeAvatar :name="row.employeeName" :employee-no="row.employeeNo" size="sm" />
            </template>
          </el-table-column>
          <el-table-column prop="date" label="日期" width="140" />
          <el-table-column prop="reason" label="冲突原因" min-width="260" />
        </el-table>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { Download, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import AppLayout from '@/components/layout/AppLayout.vue';
import EmployeeAvatar from '@/components/common/EmployeeAvatar.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import StoreSelector from '@/components/common/StoreSelector.vue';
import { exportMonthlyWorkHours } from '@/api/shift';
import { useWorkhourStore } from '@/stores/workhourStore';
import { downloadBlob } from '@/utils/export';

const workhours = useWorkhourStore();
const now = new Date();
const filters = reactive<{ month: string; storeId?: number }>({
  month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  storeId: undefined
});
const exporting = ref(false);

async function load() {
  await workhours.load({ month: filters.month, storeId: filters.storeId });
}

function summaryRow({ columns }: { columns: Array<{ property?: string }> }) {
  const totals: Record<string, string | number> = {
    workDays: workhours.totals.workDays,
    totalHours: workhours.totals.totalHours,
    regularHours: workhours.totals.regularHours,
    overtimeHours: workhours.totals.overtimeHours,
    exceptionDays: workhours.totals.exceptionDays
  };
  return columns.map((column, index) => {
    if (index === 0) return '合计';
    return column.property ? (totals[column.property] ?? '') : '';
  });
}

async function exportCsv() {
  exporting.value = true;
  try {
    const blob = (await exportMonthlyWorkHours({ month: filters.month, storeId: filters.storeId })) as unknown as Blob;
    downloadBlob(`月度工时-${filters.month}.csv`, blob);
    ElMessage.success('已导出工时统计');
  } finally {
    exporting.value = false;
  }
}

// 排班修改后切换门店/月份再次查看，结果实时重新统计
watch(() => [filters.month, filters.storeId], load);
onMounted(load);
</script>

<style scoped>
.filters {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.rules {
  color: #697066;
  font-size: 13px;
}

.overtime {
  color: #b45309;
  font-weight: 700;
}

.exceptions {
  margin-top: 18px;
}

.exceptions h2 {
  margin-top: 0;
}
</style>
