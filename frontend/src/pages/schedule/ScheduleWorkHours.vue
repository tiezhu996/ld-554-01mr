<template>
  <AppLayout>
    <div class="page-title">
      <h1>月度工时统计</h1>
      <el-button type="primary" :icon="Download" :disabled="!workhours.list.length" @click="exportCsv">导出表格</el-button>
    </div>
    <div class="panel filters">
      <StoreSelector @change="(value) => filters.storeId = value as number" />
      <el-date-picker v-model="filters.month" type="month" value-format="YYYY-MM" placeholder="选择月份" :clearable="false" />
      <el-button type="primary" @click="load">查询</el-button>
    </div>
    <div class="panel">
      <el-table v-loading="workhours.loading" :data="workhours.list">
        <el-table-column prop="employeeNo" label="工号" width="140" />
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="storeName" label="门店" />
        <el-table-column prop="workDays" label="计薪天数" width="100" align="right" />
        <el-table-column label="总工时（小时）" width="130" align="right">
          <template #default="{ row }">{{ row.totalHours.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="加班工时（小时）" width="140" align="right">
          <template #default="{ row }">
            <span :class="{ 'overtime-cell': row.overtimeHours > 0 }">{{ row.overtimeHours.toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="异常天数" width="100" align="right">
          <template #default="{ row }">
            <el-tag v-if="row.anomalyDays > 0" type="danger">{{ row.anomalyDays }}</el-tag>
            <span v-else>0</span>
          </template>
        </el-table-column>
        <template #empty><EmptyState text="该月份暂无排班工时数据" /></template>
      </el-table>
    </div>
    <div v-if="workhours.anomalies.length" class="panel">
      <h2>班次冲突异常（以下日期未计入工时，请修正排班后重新查询）</h2>
      <el-table :data="workhours.anomalies">
        <el-table-column prop="date" label="日期" width="130" />
        <el-table-column prop="employeeNo" label="工号" width="140" />
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="reason" label="冲突原因" show-overflow-tooltip />
      </el-table>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, reactive } from 'vue';
import { Download } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import AppLayout from '@/components/layout/AppLayout.vue';
import StoreSelector from '@/components/common/StoreSelector.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { useWorkhourStore } from '@/stores/workhourStore';
import { exportMonthlyWorkHours } from '@/api/workhour';
import { downloadBlob } from '@/utils/export';

const workhours = useWorkhourStore();
const filters = reactive<{ storeId?: number; month: string }>({
  month: new Date().toISOString().slice(0, 7)
});

async function load() {
  if (!filters.month) {
    ElMessage.warning('请选择月份');
    return;
  }
  await workhours.load({ storeId: filters.storeId, month: filters.month });
}

async function exportCsv() {
  const blob = await exportMonthlyWorkHours({ storeId: filters.storeId, month: filters.month }) as unknown as Blob;
  downloadBlob(`月度工时-${filters.month}.csv`, blob);
}

onMounted(load);
</script>

<style scoped>
.filters {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
}

.overtime-cell {
  color: #b3540e;
  font-weight: 600;
}
</style>
