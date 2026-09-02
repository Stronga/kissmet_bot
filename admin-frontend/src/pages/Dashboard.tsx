import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Card, ErrorBox, Loading, PageHeader } from "../components/ui";
import { formatMinorUnits } from "../utils/money";

export function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api("/admin/dashboard/overview"),
      api("/admin/dashboard/occupancy"),
      api("/admin/dashboard/applications"),
      api("/admin/dashboard/maintenance"),
      api("/admin/dashboard/finance").catch(() => null),
    ])
      .then(([overview, occupancy, applications, maintenance, finance]) => {
        setData({ overview, occupancy, applications, maintenance, finance });
      })
      .catch((err) => setError(err.message));
  }, []);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  const occ = data.occupancy;
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Live hostel operations" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card title="Residents"><p className="text-3xl font-semibold">{data.overview.residents}</p></Card>
        <Card title="Applicants"><p className="text-3xl font-semibold">{data.overview.applicants}</p></Card>
        <Card title="Active bookings"><p className="text-3xl font-semibold">{data.overview.activeBookings}</p></Card>
        <Card title="Occupancy">
          <p className="text-3xl font-semibold">{occ.occupancyPercent}%</p>
          <p className="text-xs text-slate-500">{occ.occupiedBeds} of {occ.usableBeds} usable beds</p>
        </Card>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Room occupancy">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500"><tr><th className="py-2">Room</th><th>Capacity</th><th>Usable</th><th>Occupied</th><th>Available</th></tr></thead>
              <tbody>
                {occ.rooms.map((r: any) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-2">{r.room_code}</td>
                    <td>{r.capacity}</td>
                    <td>{r.usable_beds}</td>
                    <td>{r.occupied_beds}</td>
                    <td>{r.available_beds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Finance">
          {data.finance ? (
            <div className="space-y-2 text-sm">
              <p>Expected: {formatMinorUnits(data.finance.expectedRevenueMinor)}</p>
              <p>Verified: {formatMinorUnits(data.finance.verifiedRevenueMinor)}</p>
              <p>Pending/submitted: {formatMinorUnits(data.finance.pendingSubmittedMinor)}</p>
              <p>Refunded: {formatMinorUnits(data.finance.refundedMinor)}</p>
            </div>
          ) : <p className="text-sm text-slate-500">Finance summary is unavailable for this role.</p>}
        </Card>
      </div>
    </div>
  );
}
