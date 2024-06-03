import * as Sentry from '@sentry/node';
import TRANSACTION from '../models/transaction.model';

export default async function mark_transaction_as_failed(changeData: any) {
  // check that the 'fullDocumentBeforeChange' exists
  if (
    Object.prototype.hasOwnProperty.call(
      changeData,
      'fullDocumentBeforeChange'
    ) === false
  ) {
    Sentry.captureMessage(
      "A mark_payment_as_failed trigger came in that didn't contain a fullDocumentBeforeChange object",
      'warning'
    );
    return;
  }

  const {fullDocumentBeforeChange} = changeData;

  // check for the accompanying transaction
  const transactionInfo = await TRANSACTION.findOne({
    ref: fullDocumentBeforeChange.ref,
  });

  if (!transactionInfo) {
    Sentry.addBreadcrumb({
      category: 'transaction',
      message: 'Transaction not found',
      data: fullDocumentBeforeChange,
    });

    Sentry.captureMessage(
      'A mark_payment_as_failed trigger came in without a corresponding transaction',
      'warning'
    );
    return;
  }

  if (transactionInfo.status !== 'pending') {
    return;
  }

  await TRANSACTION.updateOne(
    {ref: fullDocumentBeforeChange.ref},
    {status: 'failed'}
  );
}
