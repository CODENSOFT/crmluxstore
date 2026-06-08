// Inregistreaza TOATE modelele Mongoose.
// Necesar pentru `populate` pe instante serverless reci: daca un model referit
// printr-un `ref` (ex: Warehouse) nu e importat de ruta, Mongoose arunca
// MissingSchemaError. Importand acest barrel garantam ca toate sunt inregistrate.
import "./User";
import "./Warehouse";
import "./Product";
import "./Order";
import "./Task";
import "./Transfer";
import "./WriteOff";
import "./StockArrival";
import "./Settings";
import "./Notification";
import "./AuditLog";
import "./Supplier";
