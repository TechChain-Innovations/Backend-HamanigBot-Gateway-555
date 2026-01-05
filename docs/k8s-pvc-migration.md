# Hummingbot Gateway: Migration from emptyDir to PersistentVolumeClaim

## Problem Description

Current deployment uses `emptyDir` for `/home/gateway/conf` volume, which causes wallet data loss on pod restart.

**Current configuration (problematic):**
```yaml
volumes:
  - emptyDir: {}
    name: conf
  - emptyDir: {}
    name: logs
```

**Wallets location:** `/home/gateway/conf/wallets/`

## Solution

Replace `emptyDir` with `PersistentVolumeClaim` for the `conf` volume.

---

## Required Changes in Helm Chart

**Repository:** `TechChain-Innovations/TMB-HamanigBot-Gateway`
**Chart location:** `charts/hummingbot-gateway/`

### 1. Update `values.yaml` (add persistence section)

Add the following section to `values.yaml`:

```yaml
persistence:
  conf:
    enabled: true
    storageClass: "hcloud-volumes"
    accessMode: ReadWriteOnce
    size: 1Gi
    # If you want to use existing PVC, set existingClaim
    existingClaim: ""
  logs:
    enabled: false
    storageClass: "hcloud-volumes"
    accessMode: ReadWriteOnce
    size: 1Gi
    existingClaim: ""
```

### 2. Create `templates/pvc.yaml`

Create new file `templates/pvc.yaml`:

```yaml
{{- if and .Values.persistence.conf.enabled (not .Values.persistence.conf.existingClaim) }}
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ include "hummingbot-gateway.fullname" . }}-conf
  labels:
    {{- include "hummingbot-gateway.labels" . | nindent 4 }}
spec:
  accessModes:
    - {{ .Values.persistence.conf.accessMode }}
  {{- if .Values.persistence.conf.storageClass }}
  storageClassName: {{ .Values.persistence.conf.storageClass | quote }}
  {{- end }}
  resources:
    requests:
      storage: {{ .Values.persistence.conf.size }}
{{- end }}
---
{{- if and .Values.persistence.logs.enabled (not .Values.persistence.logs.existingClaim) }}
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ include "hummingbot-gateway.fullname" . }}-logs
  labels:
    {{- include "hummingbot-gateway.labels" . | nindent 4 }}
spec:
  accessModes:
    - {{ .Values.persistence.logs.accessMode }}
  {{- if .Values.persistence.logs.storageClass }}
  storageClassName: {{ .Values.persistence.logs.storageClass | quote }}
  {{- end }}
  resources:
    requests:
      storage: {{ .Values.persistence.logs.size }}
{{- end }}
```

### 3. Update `templates/deployment.yaml`

Replace the volumes section in `templates/deployment.yaml`:

**BEFORE:**
```yaml
      volumes:
        - emptyDir: {}
          name: conf
        - emptyDir: {}
          name: logs
```

**AFTER:**
```yaml
      volumes:
        {{- if .Values.persistence.conf.enabled }}
        - name: conf
          persistentVolumeClaim:
            claimName: {{ .Values.persistence.conf.existingClaim | default (printf "%s-conf" (include "hummingbot-gateway.fullname" .)) }}
        {{- else }}
        - name: conf
          emptyDir: {}
        {{- end }}
        {{- if .Values.persistence.logs.enabled }}
        - name: logs
          persistentVolumeClaim:
            claimName: {{ .Values.persistence.logs.existingClaim | default (printf "%s-logs" (include "hummingbot-gateway.fullname" .)) }}
        {{- else }}
        - name: logs
          emptyDir: {}
        {{- end }}
```

### 4. Update environment-specific values files

Update `values-dev.yaml`:

```yaml
persistence:
  conf:
    enabled: true
    storageClass: "hcloud-volumes"
    size: 1Gi
  logs:
    enabled: false
```

---

## Deployment Steps

### Option A: Apply Changes via Helm (Recommended)

1. Clone the deploy repo:
   ```bash
   git clone git@github.com:TechChain-Innovations/TMB-HamanigBot-Gateway.git
   cd TMB-HamanigBot-Gateway
   ```

2. Make the changes described above

3. Create a PR and merge to `dev` branch

4. Deploy with helm:
   ```bash
   helm upgrade hummingbot-gateway ./charts/hummingbot-gateway \
     -n tmb-dev \
     -f ./charts/hummingbot-gateway/values-dev.yaml
   ```

### Option B: Manual PVC Creation (Quick Fix)

If you need an immediate fix before updating the helm chart:

1. Create PVC manually:
   ```bash
   ssh -i ~/.ssh/trading-mm alex@10.0.1.6

   kubectl apply -n tmb-dev -f - <<EOF
   apiVersion: v1
   kind: PersistentVolumeClaim
   metadata:
     name: hummingbot-gateway-conf
     namespace: tmb-dev
     labels:
       app.kubernetes.io/name: hummingbot-gateway
       app.kubernetes.io/instance: hummingbot-gateway
   spec:
     accessModes:
       - ReadWriteOnce
     storageClassName: hcloud-volumes
     resources:
       requests:
         storage: 1Gi
   EOF
   ```

2. Patch the deployment:
   ```bash
   kubectl patch deployment hummingbot-gateway -n tmb-dev --type='json' -p='[
     {
       "op": "replace",
       "path": "/spec/template/spec/volumes/0",
       "value": {
         "name": "conf",
         "persistentVolumeClaim": {
           "claimName": "hummingbot-gateway-conf"
         }
       }
     }
   ]'
   ```

3. Wait for pod to restart and verify:
   ```bash
   kubectl get pods -n tmb-dev -l app.kubernetes.io/name=hummingbot-gateway -w
   kubectl get pvc -n tmb-dev
   ```

---

## Verification

After deployment, verify the PVC is working:

```bash
# Check PVC status
kubectl get pvc hummingbot-gateway-conf -n tmb-dev

# Check volume mount in pod
kubectl exec -n tmb-dev deployment/hummingbot-gateway -- df -h /home/gateway/conf

# Create a test wallet and restart pod to verify persistence
# (add wallet via API, then delete pod and check if wallet persists)
```

---

## Important Notes

1. **Storage Class**: Using `hcloud-volumes` (Hetzner Cloud volumes) which is the default provisioner

2. **Access Mode**: `ReadWriteOnce` - volume can be mounted by a single node

3. **Size**: 1Gi should be sufficient for wallets and configs

4. **Backup**: Consider implementing regular backups of the PVC data

5. **Init Container**: The existing `bootstrap-config` init container will continue to work - it copies initial config files to the PVC on first run

---

## Migration Status (2025-12-27)

**COMPLETED** - Quick fix (Option B) has been applied:

1. PVC `hummingbot-gateway-conf` created and bound:
   ```
   NAME                      STATUS   VOLUME                                     CAPACITY
   hummingbot-gateway-conf   Bound    pvc-5e9f573e-43e6-40c1-bb10-8ea62fa8dfa7   10Gi
   ```

2. Deployment patched to use PVC instead of emptyDir

3. Gateway is running with persistent storage:
   ```
   Filesystem: /dev/disk/by-id/scsi-0HC_Volume_104283039
   Size: 9.8G
   Mounted on: /home/gateway/conf
   ```

**Next Steps:**
- Update Helm chart in `TechChain-Innovations/TMB-HamanigBot-Gateway` repository
- Add `persistence.conf.existingClaim: hummingbot-gateway-conf` to values-dev.yaml to prevent Helm from overwriting the manual fix

---

## Current Deployment Info

- **Namespace:** tmb-dev
- **Deployment:** hummingbot-gateway
- **Helm Release:** hummingbot-gateway (revision 21)
- **Image:** techchainsolutions/hamanigbot-gateway:sha-7e9e4eb
- **Storage:** hcloud-volumes PVC (persistent) - FIXED
