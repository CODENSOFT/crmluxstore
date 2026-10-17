// Inregistreaza TOATE modelele Mongoose.
// Necesar pentru `populate` pe instante serverless reci: daca un model referit
// printr-un `ref` nu e importat de ruta, Mongoose arunca MissingSchemaError.
import "./User";
import "./Warehouse";
import "./Category";
import "./Product";
import "./Customer";
import "./Order";
import "./Task";
import "./Transfer";
import "./WriteOff";
import "./StockArrival";
import "./StockMovement";
import "./InventoryCount";
import "./Settings";
import "./Notification";
import "./AuditLog";
import "./Supplier";
import "./Counter";
import "./ApiKey";
import "./Webhook";
import "./WebhookDelivery";
import "./IntegrationLog";
